import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, File, Presentation, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface ReportDownloaderProps {
  content: string;
  title?: string;
}

type ExportFormat = "pdf" | "docx" | "xlsx" | "csv" | "txt" | "pptx";

const formatInfo: Record<ExportFormat, { label: string; icon: React.ElementType; mime: string; ext: string }> = {
  pdf: { label: "PDF Document", icon: FileText, mime: "application/pdf", ext: "pdf" },
  docx: { label: "Word Document", icon: FileText, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
  xlsx: { label: "Excel Spreadsheet", icon: FileSpreadsheet, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  csv: { label: "CSV File", icon: FileSpreadsheet, mime: "text/csv", ext: "csv" },
  txt: { label: "Plain Text", icon: File, mime: "text/plain", ext: "txt" },
  pptx: { label: "PowerPoint", icon: Presentation, mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx" },
};

// Parse markdown tables into arrays
function parseMarkdownTables(content: string): string[][][] {
  const tables: string[][][] = [];
  const lines = content.split("\n");
  let currentTable: string[][] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      // Skip separator rows
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) continue;
      const cells = trimmed.split("|").slice(1, -1).map(c => c.trim());
      currentTable.push(cells);
      inTable = true;
    } else if (inTable) {
      if (currentTable.length > 0) tables.push(currentTable);
      currentTable = [];
      inTable = false;
    }
  }
  if (currentTable.length > 0) tables.push(currentTable);
  return tables;
}

// Strip markdown formatting for plain text
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// Split content into sections for slides
function splitIntoSections(content: string): { title: string; body: string }[] {
  const sections: { title: string; body: string }[] = [];
  const lines = content.split("\n");
  let currentTitle = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentTitle || currentBody.length > 0) {
        sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
      }
      currentTitle = headingMatch[1];
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentTitle || currentBody.length > 0) {
    sections.push({ title: currentTitle, body: currentBody.join("\n").trim() });
  }
  return sections;
}

export function ReportDownloader({ content, title = "Report" }: ReportDownloaderProps) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const fileName = `${title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}-${new Date().toISOString().split("T")[0]}`;

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      switch (format) {
        case "txt":
          downloadBlob(new Blob([stripMarkdown(content)], { type: "text/plain" }), `${fileName}.txt`);
          break;

        case "csv": {
          const tables = parseMarkdownTables(content);
          if (tables.length === 0) {
            // Convert content to a simple CSV
            const lines = stripMarkdown(content).split("\n").filter(l => l.trim());
            const csvContent = lines.map(l => `"${l.replace(/"/g, '""')}"`).join("\n");
            downloadBlob(new Blob([csvContent], { type: "text/csv" }), `${fileName}.csv`);
          } else {
            // Use the first/largest table
            const table = tables.reduce((a, b) => a.length > b.length ? a : b);
            const csvContent = table.map(row => row.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
            downloadBlob(new Blob([csvContent], { type: "text/csv" }), `${fileName}.csv`);
          }
          break;
        }

        case "pdf": {
          const { jsPDF } = await import("jspdf");
          const doc = new jsPDF({ unit: "mm", format: "a4" });
          const pageWidth = doc.internal.pageSize.getWidth();
          const margin = 15;
          const maxWidth = pageWidth - margin * 2;
          let y = 20;

          doc.setFont("helvetica", "bold");
          doc.setFontSize(18);
          doc.text(title, margin, y);
          y += 8;

          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(128);
          doc.text(`Generated: ${new Date().toLocaleDateString()}`, margin, y);
          doc.setTextColor(0);
          y += 10;

          const lines = content.split("\n");
          for (const line of lines) {
            if (y > 275) {
              doc.addPage();
              y = 15;
            }

            const h1 = line.match(/^#\s+(.+)/);
            const h2 = line.match(/^##\s+(.+)/);
            const h3 = line.match(/^###\s+(.+)/);
            const bullet = line.match(/^[-*]\s+(.+)/);

            if (h1) {
              y += 4;
              doc.setFont("helvetica", "bold");
              doc.setFontSize(16);
              const wrapped = doc.splitTextToSize(stripMarkdown(h1[1]), maxWidth);
              doc.text(wrapped, margin, y);
              y += wrapped.length * 7 + 2;
            } else if (h2) {
              y += 3;
              doc.setFont("helvetica", "bold");
              doc.setFontSize(13);
              const wrapped = doc.splitTextToSize(stripMarkdown(h2[1]), maxWidth);
              doc.text(wrapped, margin, y);
              y += wrapped.length * 6 + 2;
            } else if (h3) {
              y += 2;
              doc.setFont("helvetica", "bold");
              doc.setFontSize(11);
              const wrapped = doc.splitTextToSize(stripMarkdown(h3[1]), maxWidth);
              doc.text(wrapped, margin, y);
              y += wrapped.length * 5 + 1;
            } else if (bullet) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(10);
              const text = stripMarkdown(bullet[1]);
              const wrapped = doc.splitTextToSize(text, maxWidth - 6);
              doc.text("•", margin + 2, y);
              doc.text(wrapped, margin + 6, y);
              y += wrapped.length * 4.5 + 1;
            } else if (line.trim()) {
              doc.setFont("helvetica", "normal");
              doc.setFontSize(10);
              const wrapped = doc.splitTextToSize(stripMarkdown(line), maxWidth);
              doc.text(wrapped, margin, y);
              y += wrapped.length * 4.5 + 1;
            } else {
              y += 3;
            }
          }

          doc.save(`${fileName}.pdf`);
          break;
        }

        case "xlsx": {
          const XLSX = await import("xlsx");
          const wb = XLSX.utils.book_new();
          const tables = parseMarkdownTables(content);

          if (tables.length > 0) {
            tables.forEach((table, i) => {
              const ws = XLSX.utils.aoa_to_sheet(table);
              XLSX.utils.book_append_sheet(wb, ws, `Table ${i + 1}`);
            });
          } else {
            const lines = stripMarkdown(content).split("\n").filter(l => l.trim());
            const ws = XLSX.utils.aoa_to_sheet(lines.map(l => [l]));
            XLSX.utils.book_append_sheet(wb, ws, "Report");
          }

          XLSX.writeFile(wb, `${fileName}.xlsx`);
          break;
        }

        case "docx": {
          // Generate a basic HTML-based .doc file (widely compatible)
          const htmlContent = markdownToSimpleHtml(content, title);
          const blob = new Blob(
            ['\ufeff', htmlContent],
            { type: "application/msword" }
          );
          downloadBlob(blob, `${fileName}.doc`);
          break;
        }

        case "pptx": {
          const pptxgenjs = (await import("pptxgenjs")).default;
          const pres = new pptxgenjs();
          pres.layout = "LAYOUT_WIDE";

          // Title slide
          const titleSlide = pres.addSlide();
          titleSlide.addText(title, {
            x: 0.5, y: 1.5, w: 12, h: 1.5,
            fontSize: 36, bold: true, color: "1a365d",
            align: "center",
          });
          titleSlide.addText(`Generated: ${new Date().toLocaleDateString()}`, {
            x: 0.5, y: 3.2, w: 12, h: 0.5,
            fontSize: 14, color: "666666",
            align: "center",
          });

          // Content slides
          const sections = splitIntoSections(content);
          for (const section of sections) {
            if (!section.title && !section.body.trim()) continue;
            const slide = pres.addSlide();

            if (section.title) {
              slide.addText(stripMarkdown(section.title), {
                x: 0.5, y: 0.3, w: 12, h: 0.8,
                fontSize: 24, bold: true, color: "1a365d",
              });
            }

            if (section.body.trim()) {
              const bodyLines = section.body.split("\n").filter(l => l.trim());
              const bulletPoints = bodyLines.map(l => {
                const isBullet = /^[-*]\s/.test(l);
                return {
                  text: stripMarkdown(l.replace(/^[-*]\s+/, "")),
                  options: {
                    bullet: isBullet ? { type: "bullet" as const } : undefined,
                    fontSize: 14,
                    color: "333333" as const,
                    breakLine: true,
                  },
                };
              });

              slide.addText(bulletPoints, {
                x: 0.5, y: 1.3, w: 12, h: 5.5,
                valign: "top",
                lineSpacingMultiple: 1.3,
              });
            }
          }

          await pres.writeFile({ fileName: `${fileName}.pptx` });
          break;
        }
      }

      toast({ title: "Downloaded", description: `Report exported as ${formatInfo[format].label}.` });
    } catch (error) {
      console.error("Export error:", error);
      toast({ title: "Export failed", description: "Could not export the report. Please try again.", variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 h-7">
          {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
          Download
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {(Object.entries(formatInfo) as [ExportFormat, typeof formatInfo[ExportFormat]][]).map(([key, info]) => (
          <DropdownMenuItem
            key={key}
            onClick={() => handleExport(key)}
            disabled={!!exporting}
            className="gap-2"
          >
            <info.icon className="h-4 w-4" />
            {info.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function markdownToSimpleHtml(md: string, title: string): string {
  let html = md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*(.+?)\*/g, "<i>$1</i>")
    .replace(/^[-*] (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "<br/><br/>");

  return `<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:Calibri,Arial,sans-serif;margin:40px;line-height:1.6;color:#333}
h1{color:#1a365d;border-bottom:2px solid #1a365d;padding-bottom:8px}
h2{color:#2d3748;margin-top:24px}h3{color:#4a5568}
table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #cbd5e0;padding:8px 12px;text-align:left}
th{background:#edf2f7;font-weight:bold}
ul{margin:8px 0;padding-left:24px}li{margin:4px 0}</style></head>
<body><h1>${title}</h1><p style="color:#666">Generated: ${new Date().toLocaleDateString()}</p>${html}</body></html>`;
}
