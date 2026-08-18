'use client';

import { useState } from 'react';
import {
  Download,
  FileText,
  FileCode,
  Copy,
  Check,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import {
  ReportData,
  downloadPdfReport,
  downloadMarkdownReport,
  copyMarkdownReport,
} from '@/lib/reports/export';

interface ExportReportMenuProps {
  reportData: ReportData;
  buttonLabel?: string;
  size?: 'sm' | 'md';
}

export default function ExportReportMenu({
  reportData,
  buttonLabel = 'Export Report',
  size = 'md',
}: ExportReportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const handleCopyMarkdown = async () => {
    const success = await copyMarkdownReport(reportData);
    if (success) {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleDownloadPdf = async () => {
    setIsExportingPdf(true);
    try {
      downloadPdfReport(reportData);
    } catch (err) {
      console.error('Error generating PDF report:', err);
    } finally {
      setIsExportingPdf(false);
      setIsOpen(false);
    }
  };

  const handleDownloadMarkdown = () => {
    downloadMarkdownReport(reportData);
    setIsOpen(false);
  };

  const isSmall = size === 'sm';

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center space-x-1.5 rounded-xl font-bold transition-all border ${
          isSmall
            ? 'px-3 py-1.5 text-xs bg-gray-800/90 hover:bg-gray-800 text-gray-200 border-gray-700'
            : 'px-4 py-2 text-xs bg-gray-900/90 hover:bg-gray-800 text-emerald-400 border-emerald-500/30 hover:border-emerald-500/50 shadow-md shadow-emerald-950'
        }`}
        title="Export or copy review findings report"
      >
        <Download className="w-3.5 h-3.5 text-emerald-400" />
        <span>{buttonLabel}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-gray-950 border border-gray-800 shadow-2xl z-50 p-1.5 space-y-1 backdrop-blur-xl animate-fade-in font-mono text-xs">
            <div className="px-3 py-2 border-b border-gray-800 text-[10px] text-gray-400 uppercase tracking-wider font-bold">
              Export Compliance Deliverable
            </div>

            {/* PDF Option */}
            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-gray-200 hover:bg-emerald-950/40 hover:text-emerald-300 transition-colors text-left group"
            >
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                <span className="font-sans font-medium text-xs">PDF Document</span>
              </div>
              {isExportingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              ) : (
                <span className="text-[10px] text-gray-500">.pdf</span>
              )}
            </button>

            {/* Markdown File Option */}
            <button
              onClick={handleDownloadMarkdown}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-gray-200 hover:bg-emerald-950/40 hover:text-emerald-300 transition-colors text-left group"
            >
              <div className="flex items-center space-x-2">
                <FileCode className="w-4 h-4 text-cyan-400 group-hover:scale-110 transition-transform" />
                <span className="font-sans font-medium text-xs">Markdown File</span>
              </div>
              <span className="text-[10px] text-gray-500">.md</span>
            </button>

            {/* Copy Markdown to Clipboard */}
            <button
              onClick={handleCopyMarkdown}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-gray-200 hover:bg-emerald-950/40 hover:text-emerald-300 transition-colors text-left group border-t border-gray-800/80"
            >
              <div className="flex items-center space-x-2">
                {isCopied ? (
                  <Check className="w-4 h-4 text-emerald-400 animate-bounce" />
                ) : (
                  <Copy className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
                )}
                <span className="font-sans font-medium text-xs">
                  {isCopied ? 'Copied to Clipboard!' : 'Copy as Markdown'}
                </span>
              </div>
              {isCopied && <span className="text-[10px] text-emerald-400 font-bold">✓</span>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
