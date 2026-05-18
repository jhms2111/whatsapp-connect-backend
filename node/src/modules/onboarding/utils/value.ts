export function valueOrEmpty(value: any): string {
  if (value === undefined || value === null) return '';

  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map(String)
      .join(', ');
  }

  return String(value).trim();
}

export function arrayOrEmpty(value: any): string[] {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map(String);
  }

  return [String(value).trim()].filter(Boolean);
}

export function cleanString(value: any): string {
  if (
    value === undefined ||
    value === null
  ) {
    return '';
  }

  return String(value).trim();
}

export function cleanStringArray(
  value: any
): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [
    String(value).trim(),
  ].filter(Boolean);
}