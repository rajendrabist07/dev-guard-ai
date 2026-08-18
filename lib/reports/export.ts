import { jsPDF } from 'jspdf';
import { Finding } from '@/lib/db/types';

export interface ReportData {
  title: string;
  prNumber?: number | string;
  author?: string;
  commitSha?: string;
  timestamp?: string;
  status?: string;
  reviewType?: string;
  toolCallsCount?: number;
  providerUsed?: string;
  summary?: string;
  findings: Finding[];
}

/**
 * Generates a structured GitHub-Flavored Markdown report.
 */
export function generateMarkdownReport(data: ReportData): string {
  const dateStr = data.timestamp ? new Date(data.timestamp).toUTCString() : new Date().toUTCString();
  const criticalCount = data.findings.filter((f) => f.severity === 'critical').length;
  const warningCount = data.findings.filter((f) => f.severity === 'warning').length;
  const infoCount = data.findings.filter((f) => f.severity === 'info').length;
  const totalFindings = data.findings.length;

  let md = `# 🛡️ DevGuard AI — Automated Code Security & PR Review Report\n\n`;
  md += `**Report Generated:** ${dateStr}  \n`;
  md += `**Review Target:** ${data.title}  \n`;
  if (data.prNumber) md += `**PR Number:** #${data.prNumber}  \n`;
  if (data.author) md += `**Author / Committer:** @${data.author}  \n`;
  if (data.commitSha) md += `**Commit SHA:** \`${data.commitSha.substring(0, 10)}\`  \n`;
  if (data.reviewType) md += `**Evaluation Mode:** ${data.reviewType}  \n`;
  if (data.toolCallsCount) md += `**Empirical Tool Iterations:** ${data.toolCallsCount} steps  \n`;
  if (data.providerUsed) md += `**Agent Orchestrator:** ${data.providerUsed}  \n`;

  md += `\n---\n\n`;
  md += `## 📊 Executive Summary\n\n`;
  md += `| Metric | Count | Status |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| **Critical Security Vulnerabilities** | **${criticalCount}** | ${criticalCount > 0 ? '🔴 Immediate Fix Required' : '🟢 None Detected'} |\n`;
  md += `| **Warnings & Code Quality** | **${warningCount}** | ${warningCount > 0 ? '🟡 Attention Recommended' : '🟢 Clean'} |\n`;
  md += `| **Informational Notices** | **${infoCount}** | 🔵 Info |\n`;
  md += `| **Total Findings Identified** | **${totalFindings}** | ${totalFindings === 0 ? '🛡️ ALL CHECKS PASSED' : '⚠️ Action Items Pending'} |\n\n`;

  if (totalFindings === 0) {
    md += `> [!NOTE]\n`;
    md += `> **PASS — No security advisories or AST linter errors were detected.**\n`;
    md += `> All automated checks, dependency vulnerability scans (OSV.dev), and test suite assertions completed successfully with clean results.\n\n`;
  } else {
    md += `## 🔍 Detailed Findings & Actionable Remediations\n\n`;
    data.findings.forEach((finding, idx) => {
      const sevIcon = finding.severity === 'critical' ? '🔴 CRITICAL' : finding.severity === 'warning' ? '🟡 WARNING' : '🔵 INFO';
      md += `### ${idx + 1}. [${sevIcon}] \`${finding.file_path}\` (Line ${finding.line})\n\n`;
      md += `- **Tool Source:** \`${finding.tool_source || 'AST Linter'}\`\n`;
      md += `- **Description:** ${finding.message}\n\n`;

      if (finding.suggested_fix) {
        md += `**Suggested Code Remediation:**\n\n`;
        md += `\`\`\`typescript\n${finding.suggested_fix}\n\`\`\`\n\n`;
      }
      md += `---\n\n`;
    });
  }

  md += `## ⚙️ Verification Architecture\n\n`;
  md += `DevGuard AI employs an autonomous multi-step reasoning loop combining:\n`;
  md += `1. **AST Static Code Linter**: Detects direct SQL concatenation, unescaped queries, hardcoded secrets, and unhandled promises.\n`;
  md += `2. **OSV.dev Vulnerability Scanner**: Queries package manifests against the Google Open Source Vulnerability database for known CVEs and prototype pollutions.\n`;
  md += `3. **Automated Test Validation**: Programmatically validates unit assertions.\n\n`;
  md += `*Report created autonomously by [DevGuard AI](https://dev-guard-ai.vercel.app)*\n`;

  return md;
}

/**
 * Triggers a browser download of the Markdown report file.
 */
export function downloadMarkdownReport(data: ReportData) {
  const content = generateMarkdownReport(data);
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const sanitizedTitle = (data.title || 'review-report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  link.href = url;
  link.download = `devguard-report-${sanitizedTitle}.md`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Copies the Markdown report to the user's clipboard.
 */
export async function copyMarkdownReport(data: ReportData): Promise<boolean> {
  try {
    const content = generateMarkdownReport(data);
    await navigator.clipboard.writeText(content);
    return true;
  } catch (err) {
    console.error('Failed to copy markdown report:', err);
    return false;
  }
}

/**
 * Generates and downloads a clean, professional PDF compliance report.
 */
export function downloadPdfReport(data: ReportData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  // Helper for page break
  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Header Banner Background
  doc.setFillColor(11, 15, 25); // #0b0f19
  doc.rect(0, 0, pageWidth, 38, 'F');

  // Title & Branding
  doc.setTextColor(16, 185, 129); // #10b981 emerald
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('DEVGUARD AI', margin, 14);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Automated Code Security & PR Review Report', margin, 21);

  doc.setTextColor(156, 163, 175); // #9ca3af
  doc.setFontSize(8);
  const dateStr = data.timestamp ? new Date(data.timestamp).toUTCString() : new Date().toUTCString();
  doc.text(`Generated: ${dateStr}`, margin, 28);

  y = 44;

  // Review Target Info Card
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'F');

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Target:', margin + 4, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(data.title, contentWidth - 30), margin + 20, y + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Author:', margin + 4, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(data.author || 'Anonymous', margin + 20, y + 13);

  doc.setFont('helvetica', 'bold');
  doc.text('Commit / Run:', margin + 4, y + 20);
  doc.setFont('helvetica', 'normal');
  doc.text(data.commitSha ? data.commitSha.substring(0, 12) : 'Live Playground Test', margin + 30, y + 20);

  y += 30;

  // Severity Stats Summary Cards (3 Columns)
  const criticalCount = data.findings.filter((f) => f.severity === 'critical').length;
  const warningCount = data.findings.filter((f) => f.severity === 'warning').length;
  const infoCount = data.findings.filter((f) => f.severity === 'info').length;

  const cardWidth = (contentWidth - 6) / 3;

  // Critical Card
  doc.setFillColor(254, 242, 242);
  doc.setDrawColor(248, 113, 113);
  doc.roundedRect(margin, y, cardWidth, 18, 2, 2, 'FD');
  doc.setTextColor(220, 38, 38);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${criticalCount}`, margin + 5, y + 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Critical Vulnerabilities', margin + 5, y + 14);

  // Warning Card
  doc.setFillColor(254, 252, 232);
  doc.setDrawColor(250, 204, 21);
  doc.roundedRect(margin + cardWidth + 3, y, cardWidth, 18, 2, 2, 'FD');
  doc.setTextColor(202, 138, 4);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${warningCount}`, margin + cardWidth + 8, y + 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Warnings / Lint Issues', margin + cardWidth + 8, y + 14);

  // Info Card
  doc.setFillColor(236, 254, 255);
  doc.setDrawColor(34, 211, 238);
  doc.roundedRect(margin + (cardWidth + 3) * 2, y, cardWidth, 18, 2, 2, 'FD');
  doc.setTextColor(8, 145, 178);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${infoCount}`, margin + (cardWidth + 3) * 2 + 5, y + 8);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Informational Notes', margin + (cardWidth + 3) * 2 + 5, y + 14);

  y += 26;

  // Section Header: Detailed Findings
  doc.setTextColor(17, 24, 39);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Detailed Security Findings', margin, y);
  y += 6;

  if (data.findings.length === 0) {
    // Clean Positive State Box
    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(52, 211, 153);
    doc.roundedRect(margin, y, contentWidth, 22, 2, 2, 'FD');
    doc.setTextColor(5, 150, 105);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('PASSED - ZERO SECURITY FINDINGS', margin + 6, y + 8);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 81);
    doc.text('All AST static linters, dependency vulnerability scans, and test assertions passed cleanly.', margin + 6, y + 15);
    y += 28;
  } else {
    data.findings.forEach((finding, index) => {
      ensureSpace(34);

      const isCritical = finding.severity === 'critical';
      const isWarning = finding.severity === 'warning';

      // Finding Header pill
      doc.setFillColor(isCritical ? 254 : isWarning ? 254 : 240, isCritical ? 242 : isWarning ? 252 : 249, isCritical ? 242 : isWarning ? 232 : 255);
      doc.setDrawColor(isCritical ? 239 : isWarning ? 245 : 147, isCritical ? 68 : isWarning ? 158 : 197, isCritical ? 68 : isWarning ? 11 : 253);
      doc.roundedRect(margin, y, contentWidth, 7, 1, 1, 'FD');

      doc.setTextColor(isCritical ? 185 : isWarning ? 180 : 30, isCritical ? 28 : isWarning ? 83 : 64, isCritical ? 28 : isWarning ? 9 : 175);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(
        `#${index + 1} [${finding.severity.toUpperCase()}] ${finding.file_path} (Line ${finding.line}) - Tool: ${finding.tool_source || 'AST Linter'}`,
        margin + 3,
        y + 4.8
      );
      y += 9;

      // Message text
      doc.setTextColor(31, 41, 55);
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      const msgLines = doc.splitTextToSize(finding.message, contentWidth - 4);
      doc.text(msgLines, margin + 2, y);
      y += msgLines.length * 4.2 + 2;

      // Suggested Fix Box (if present)
      if (finding.suggested_fix) {
        ensureSpace(16);
        const fixLines = doc.splitTextToSize(`Suggested Fix: ${finding.suggested_fix.trim()}`, contentWidth - 6);
        const fixBoxHeight = fixLines.length * 3.8 + 4;

        doc.setFillColor(243, 244, 246);
        doc.setDrawColor(229, 231, 235);
        doc.roundedRect(margin + 2, y, contentWidth - 4, fixBoxHeight, 1, 1, 'FD');

        doc.setTextColor(55, 65, 81);
        doc.setFontSize(7.5);
        doc.setFont('courier', 'normal');
        doc.text(fixLines, margin + 5, y + 3.8);

        y += fixBoxHeight + 3;
      } else {
        y += 2;
      }

      y += 3; // spacing between findings
    });
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(156, 163, 175);
    doc.text(`DevGuard AI Security Compliance Report • Page ${i} of ${totalPages}`, margin, pageHeight - 8);
    doc.text('https://dev-guard-ai.vercel.app', pageWidth - margin - 40, pageHeight - 8);
  }

  const sanitizedTitle = (data.title || 'review-report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  doc.save(`devguard-report-${sanitizedTitle}.pdf`);
}
