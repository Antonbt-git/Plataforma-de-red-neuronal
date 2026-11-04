"""Lectura y perfilado de datasets CSV.

El contenido se inspecciona en el servidor y se guarda en el almacenamiento
de objetos local (volumen configurable). Nunca se ejecuta código del archivo.
"""
from __future__ import annotations

import csv
import io
import math
from dataclasses import dataclass


class DatasetError(ValueError):
    """Error de validación con mensaje apto para el usuario."""


@dataclass
class ParsedDataset:
    metadata: dict
    preview: list[dict]


def _decode(content: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise DatasetError("No se pudo decodificar el archivo. Usa codificación UTF-8.")


def _is_number(value: str) -> bool:
    try:
        number = float(value)
        return math.isfinite(number)
    except (TypeError, ValueError):
        return False


def parse_csv(
    content: bytes,
    *,
    filename: str,
    target_column: str | None = None,
    max_bytes: int = 5_000_000,
) -> ParsedDataset:
    if len(content) > max_bytes:
        raise DatasetError(f"El archivo supera el límite de {max_bytes // 1_000_000} MB.")
    if not filename.lower().endswith(".csv"):
        raise DatasetError("El archivo debe tener extensión .csv.")

    text = _decode(content)
    sample = text[:8192]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel

    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    headers = [str(h).strip() for h in (reader.fieldnames or []) if h and str(h).strip()]
    if len(headers) < 2:
        raise DatasetError("El CSV necesita al menos dos columnas con encabezado.")
    if len(set(headers)) != len(headers):
        raise DatasetError("El CSV contiene encabezados duplicados.")

    rows: list[dict[str, str]] = []
    for raw in reader:
        row = {}
        for header in headers:
            value = raw.get(header, "")
            row[header] = "" if value is None else str(value).strip()
        if any(v for v in row.values()):
            rows.append(row)
    if len(rows) < 20:
        raise DatasetError("El dataset necesita al menos 20 filas de datos para entrenar.")
    if len(rows) > 200_000:
        raise DatasetError("El dataset supera el máximo de 200.000 filas para esta versión.")

    numeric_columns: list[str] = []
    for header in headers:
        values = [row[header] for row in rows if row[header] != ""]
        if values and all(_is_number(value) for value in values):
            numeric_columns.append(header)

    if target_column:
        target = target_column.strip()
        if target not in headers:
            raise DatasetError(f"La columna objetivo '{target}' no existe en el CSV.")
    else:
        if not numeric_columns:
            raise DatasetError(
                "No se detectaron columnas numéricas. Incluye al menos una variable numérica."
            )
        target = numeric_columns[-1]

    feature_candidates = [c for c in numeric_columns if c != target]
    if not feature_candidates:
        raise DatasetError(
            "Se necesita al menos una columna numérica distinta de la columna objetivo."
        )

    target_values = [row[target] for row in rows if row[target] != ""]
    unique_values = sorted(set(target_values))
    if not target_values:
        raise DatasetError("La columna objetivo está vacía.")
    if len(unique_values) > 20:
        if all(_is_number(value) for value in unique_values):
            task = "regression"
        else:
            raise DatasetError(
                "La columna objetivo tiene demasiadas categorías (máximo 20)."
            )
    elif len(unique_values) == 2:
        task = "binary"
    else:
        task = "multiclass"

    missing_cells = sum(1 for row in rows for header in headers if row[header] == "")
    preview = [{header: row[header] for header in headers} for row in rows[:3]]

    metadata = {
        "filename": filename,
        "rows": len(rows),
        "columns": len(headers),
        "column_names": headers,
        "numeric_columns": numeric_columns,
        "target_column": target,
        "feature_columns": feature_candidates,
        "task": task,
        "classes": unique_values[:20] if task != "regression" else [],
        "missing_cells": missing_cells,
        "preview": preview,
        "delimiter": dialect.delimiter,
    }
    return ParsedDataset(metadata=metadata, preview=preview)
