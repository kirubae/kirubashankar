/**
 * Merge Worker - Pyodide-based data merging using pandas
 * Runs in a Web Worker for non-blocking processing of large datasets
 */

let pyodide = null;
let pyodideReady = false;

// Load Pyodide and pandas
async function initPyodide() {
  try {
    self.postMessage({ type: 'PROGRESS', payload: { percent: 5, message: 'Loading Python runtime...' } });

    importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js');

    pyodide = await loadPyodide();

    self.postMessage({ type: 'PROGRESS', payload: { percent: 30, message: 'Loading pandas library...' } });

    await pyodide.loadPackage(['pandas']);

    self.postMessage({ type: 'PROGRESS', payload: { percent: 50, message: 'Setting up merge functions...' } });

    // Define Python functions for parsing and merging
    await pyodide.runPythonAsync(`
import pandas as pd
import io
import json

def parse_csv_content(content):
    """Parse CSV content and return metadata + preview"""
    try:
        df = pd.read_csv(io.StringIO(content))
        return json.dumps({
            'success': True,
            'columns': list(df.columns),
            'dtypes': {col: str(dtype) for col, dtype in df.dtypes.items()},
            'rowCount': len(df),
            'preview': df.head(5).fillna('').astype(str).to_dict('records')
        })
    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e)
        })

def merge_datasets(left_csv, right_csv, config_json):
    """Perform merge operation and return results"""
    try:
        config = json.loads(config_json)

        # Parse dataframes
        left_df = pd.read_csv(io.StringIO(left_csv))
        right_df = pd.read_csv(io.StringIO(right_csv))

        # Get merge parameters
        join_type = config.get('joinType', 'inner')
        left_key = config.get('leftKey')
        right_key = config.get('rightKey')

        # Handle multiple keys
        if isinstance(left_key, str):
            left_key = [left_key]
        if isinstance(right_key, str):
            right_key = [right_key]

        # Perform merge with indicator
        merged_df = pd.merge(
            left_df,
            right_df,
            how=join_type,
            left_on=left_key,
            right_on=right_key,
            suffixes=('', '_right'),
            indicator='_merge_status'
        )

        # Calculate statistics
        total_left = len(left_df)
        total_right = len(right_df)
        total_output = len(merged_df)

        matched = len(merged_df[merged_df['_merge_status'] == 'both'])
        left_only = len(merged_df[merged_df['_merge_status'] == 'left_only'])
        right_only = len(merged_df[merged_df['_merge_status'] == 'right_only'])

        # Apply column selection if specified
        selected_columns = config.get('selectedColumns', [])
        column_renames = config.get('columnRenames', {})

        # Remove merge indicator for output
        output_df = merged_df.drop('_merge_status', axis=1)

        if selected_columns:
            # Filter to selected columns only
            output_df = output_df[[c for c in selected_columns if c in output_df.columns]]

        if column_renames:
            output_df = output_df.rename(columns=column_renames)

        # Generate CSV output
        csv_output = output_df.to_csv(index=False)

        # Generate preview (first 100 rows)
        preview = output_df.head(100).fillna('').astype(str).to_dict('records')

        return json.dumps({
            'success': True,
            'stats': {
                'leftRows': total_left,
                'rightRows': total_right,
                'outputRows': total_output,
                'matched': matched,
                'leftOnly': left_only,
                'rightOnly': right_only,
                'joinType': join_type
            },
            'columns': list(output_df.columns),
            'preview': preview,
            'csv': csv_output
        })

    except Exception as e:
        return json.dumps({
            'success': False,
            'error': str(e)
        })
    `);

    pyodideReady = true;
    self.postMessage({ type: 'READY' });

  } catch (error) {
    self.postMessage({ type: 'ERROR', payload: { message: 'Failed to initialize: ' + error.message } });
  }
}

// Parse file content (CSV)
async function parseFile(content, fileId) {
  if (!pyodideReady) {
    self.postMessage({ type: 'ERROR', payload: { message: 'Python runtime not ready' } });
    return;
  }

  try {
    // Escape the content for Python string
    const escapedContent = content.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');

    const result = await pyodide.runPythonAsync(`parse_csv_content('''${escapedContent}''')`);
    const parsed = JSON.parse(result);

    self.postMessage({ type: 'PARSED', payload: { ...parsed, fileId } });

  } catch (error) {
    self.postMessage({ type: 'ERROR', payload: { message: 'Parse error: ' + error.message, fileId } });
  }
}

// Perform merge operation
async function merge(leftContent, rightContent, config) {
  if (!pyodideReady) {
    self.postMessage({ type: 'ERROR', payload: { message: 'Python runtime not ready' } });
    return;
  }

  try {
    self.postMessage({ type: 'PROGRESS', payload: { percent: 60, message: 'Merging datasets...' } });

    // Escape content for Python
    const escapeForPython = (str) => str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r');

    const leftEscaped = escapeForPython(leftContent);
    const rightEscaped = escapeForPython(rightContent);
    const configJson = JSON.stringify(config);

    self.postMessage({ type: 'PROGRESS', payload: { percent: 70, message: 'Processing data...' } });

    const result = await pyodide.runPythonAsync(`merge_datasets('''${leftEscaped}''', '''${rightEscaped}''', '${configJson.replace(/'/g, "\\'")}')`);

    self.postMessage({ type: 'PROGRESS', payload: { percent: 90, message: 'Finalizing results...' } });

    const parsed = JSON.parse(result);

    if (parsed.success) {
      self.postMessage({ type: 'MERGE_COMPLETE', payload: parsed });
    } else {
      self.postMessage({ type: 'ERROR', payload: { message: parsed.error } });
    }

  } catch (error) {
    self.postMessage({ type: 'ERROR', payload: { message: 'Merge error: ' + error.message } });
  }
}

// Message handler
self.onmessage = async function(e) {
  const { type, payload } = e.data;

  switch (type) {
    case 'INIT':
      await initPyodide();
      break;

    case 'PARSE':
      await parseFile(payload.content, payload.fileId);
      break;

    case 'MERGE':
      await merge(payload.leftContent, payload.rightContent, payload.config);
      break;

    default:
      self.postMessage({ type: 'ERROR', payload: { message: 'Unknown command: ' + type } });
  }
};
