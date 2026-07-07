export interface WidgetConfig {
  id: string;
  value: any;
  label: string;
  type: 'chart' | 'gauge' | 'text' | 'boolean';
  unit?: string;
  displayType?: 'line' | 'bar' | 'gauge' | 'text';
}

export function parseSerialPayload(rawText: string): Record<string, any> | null {
  try {
    // Attempt to parse standard JSON
    const parsed = JSON.parse(rawText);
    if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
      return parsed;
    }
    return null;
  } catch (e) {
    // If it's not JSON, we might want to support simple KEY:VALUE|KEY:VALUE format later
    // For now, return null to ignore non-JSON payload for widget engine
    return null;
  }
}

export function extractWidgetsFromPayload(
  payload: Record<string, any>, 
  currentWidgets: Map<string, WidgetConfig>
): Map<string, WidgetConfig> {
  const nextWidgets = new Map(currentWidgets);

  Object.entries(payload).forEach(([key, value]) => {
    // Determine type by value if not explicitly configured
    let inferredType: WidgetConfig['type'] = 'text';
    if (typeof value === 'number') {
      inferredType = 'chart'; // Default numbers to chart
    } else if (typeof value === 'boolean') {
      inferredType = 'boolean';
    }

    const existing = nextWidgets.get(key);
    
    if (existing) {
      // Update value
      nextWidgets.set(key, { ...existing, value });
    } else {
      // Create new widget
      nextWidgets.set(key, {
        id: key,
        label: key.toUpperCase(),
        value,
        type: inferredType
      });
    }
  });

  return nextWidgets;
}
