'use client';

import React, { useState } from 'react';

type UploadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
};

export default function UploadModal({ isOpen, onClose, onUploadSuccess }: UploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message?: string;
    fileType?: string;
    rowsInserted?: number;
    warnings?: Array<{ row: number; field: string; message: string }>;
  } | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult({
          ok: true,
          fileType: data.fileType,
          rowsInserted: data.rowsInserted,
          warnings: data.warnings,
          message: `Successfully processed ${data.rowsInserted} rows as ${data.fileType}.`,
        });
        onUploadSuccess();
      } else {
        setResult({
          ok: false,
          message: data.error || 'Failed to upload spreadsheet.',
          warnings: data.warnings,
        });
      }
    } catch {
      setResult({
        ok: false,
        message: 'Network error while uploading file.',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Upload Data Spreadsheet</h3>
            <p className="text-xs text-slate-500 mt-1">
              Upload Timesheet, Salary, or Project Prices. The parser auto-detects file type and header layout.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 text-sm rounded-lg"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-lg p-6 text-center transition-colors">
          <input
            type="file"
            id="file-upload"
            className="hidden"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
          />
          <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center">
            <svg
              className="w-10 h-10 text-slate-400 mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
              {file ? file.name : 'Select .xlsx or .xls spreadsheet'}
            </span>
            <span className="text-xs text-slate-400 mt-1">
              Supports real-world formats with irregular headers and date formats
            </span>
          </label>
        </div>

        {result && (
          <div
            className={`mt-4 p-3 rounded-lg text-sm ${
              result.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <p className="font-medium">{result.message}</p>
            {result.warnings && result.warnings.length > 0 && (
              <div className="mt-2 text-xs">
                <span className="font-semibold">Warnings ({result.warnings.length}):</span>
                <ul className="list-disc pl-4 mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                  {result.warnings.slice(0, 5).map((w, idx) => (
                    <li key={idx}>Row {w.row}: [{w.field}] {w.message}</li>
                  ))}
                  {result.warnings.length > 5 && (
                    <li>...and {result.warnings.length - 5} more warnings.</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            disabled={!file || uploading}
            onClick={handleUpload}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
          >
            {uploading ? 'Processing...' : 'Upload & Parse'}
          </button>
        </div>
      </div>
    </div>
  );
}
