import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoImg from "@/pages/logo.jpg";

// Loads the company logo as an HTMLImageElement so it can be embedded into
// generated PDFs. Mirrors the pattern already used for the Tasks page export.
function loadScheduleHistoryLogo(): Promise<{ img: HTMLImageElement; aspect: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ img, aspect: img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1 });
    img.onerror = () => resolve({ img, aspect: 1 });
    img.src = logoImg;
  });
}

/**
 * All columns available in the Schedule History PDF export. `taskOnly`
 * columns only apply when the export includes the Task column (i.e. the
 * Project Schedule History view, not a single task's history).
 */
export const SCHEDULE_HISTORY_COLUMNS: { id: string; label: string; taskOnly?: boolean }[] = [
  { id: "task", label: "Task", taskOnly: true },
  { id: "datetime", label: "Date & Time" },
  { id: "type", label: "Type" },
  { id: "changedBy", label: "Changed By" },
  { id: "startDate", label: "Start Date" },
  { id: "endDate", label: "End Date" },
  { id: "duration", label: "Duration" },
  { id: "reason", label: "Reason" },
];

function formatHistoryDate(d?: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function formatHistoryDateTime(d?: string | Date | null): string {
  if (!d) return "-";
  try {
    const date = new Date(d);
    const datePart = date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
    const timePart = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    return `${datePart}\n${timePart}`;
  } catch {
    return String(d);
  }
}

export interface ScheduleHistoryPdfEntry {
  changedAt?: string | Date | null;
  taskName?: string | null;
  changeType?: string | null;
  changedByName?: string | null;
  previousStartDate?: string | null;
  newStartDate?: string | null;
  previousEndDate?: string | null;
  newEndDate?: string | null;
  previousDuration?: number | null;
  newDuration?: number | null;
  reason?: string | null;
  triggeredByTaskName?: string | null;
  shiftedByDays?: number | null;
}

/**
 * Exports a list of schedule-history entries (either a single task's history
 * or a whole project's history) to a downloadable PDF. Used by both the
 * per-task Schedule History dialog and the Project Schedule History dialog.
 */
export async function exportScheduleHistoryToPDF(
  title: string,
  entries: ScheduleHistoryPdfEntry[],
  options?: { subtitle?: string; showTaskColumn?: boolean; fileName?: string; selectedColumns?: string[] }
) {
  const showTaskColumn = options?.showTaskColumn ?? true;
  // Which columns to actually render, in the canonical order. Defaults to
  // every applicable column when the caller doesn't specify a selection.
  const selectedColumns =
    options?.selectedColumns ??
    SCHEDULE_HISTORY_COLUMNS.filter((c) => !c.taskOnly || showTaskColumn).map((c) => c.id);
  const activeColumns = SCHEDULE_HISTORY_COLUMNS.filter(
    (c) => (!c.taskOnly || showTaskColumn) && selectedColumns.includes(c.id)
  );

  // Always landscape: this table has a lot of columns and needs the room
  // regardless of whether the Task column is shown.
  const doc = new jsPDF("landscape");
  const pageWidth = doc.internal.pageSize.getWidth();

  const { img: logoElement, aspect } = await loadScheduleHistoryLogo();
  const logoSize = 18;
  const logoMarginLeft = 14;
  const logoMarginTop = 10;
  let textX = 14;
  try {
    doc.addImage(logoElement, "PNG", logoMarginLeft, logoMarginTop, logoSize, logoSize / (aspect || 1));
    textX = logoMarginLeft + logoSize + 6;
  } catch {
    // logo failed to decode; continue without it, keeping the original text position
  }

  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text(title, textX, 18);

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105); // slate-600 (darker than before, still secondary)
  let subY = 25;
  if (options?.subtitle) {
    doc.text(options.subtitle, textX, subY);
    subY += 5;
  }
  doc.text(`Generated: ${new Date().toLocaleString()}`, textX, subY);
  doc.text(`${entries.length} schedule change${entries.length === 1 ? "" : "s"} recorded`, textX, subY + 5);

  // Make sure the table always starts below the logo, even when there's no
  // subtitle and the logo is taller than the text block.
  const tableStartY = Math.max(subY + 10, logoMarginTop + logoSize / (aspect || 1) + 8);

  const head: string[] = activeColumns.map((c) => c.label);

  const cellValue = (colId: string, e: ScheduleHistoryPdfEntry): string => {
    switch (colId) {
      case "task":
        return e.taskName || "Unknown task";
      case "datetime":
        return formatHistoryDateTime(e.changedAt);
      case "type":
        return e.changeType || "-";
      case "changedBy":
        return e.changeType === "Manual"
          ? e.changedByName || "User"
          : e.triggeredByTaskName
            ? `via ${e.triggeredByTaskName}`
            : "System";
      case "startDate":
        return e.previousStartDate !== e.newStartDate
          ? `${formatHistoryDate(e.previousStartDate)}\n-> ${formatHistoryDate(e.newStartDate)}`
          : "-";
      case "endDate":
        return e.previousEndDate !== e.newEndDate
          ? `${formatHistoryDate(e.previousEndDate)}\n-> ${formatHistoryDate(e.newEndDate)}`
          : "-";
      case "duration":
        return e.previousDuration !== e.newDuration
          ? `${e.previousDuration ?? "-"}\n-> ${e.newDuration ?? "-"} days`
          : "-";
      case "reason":
        return e.reason || "-";
      default:
        return "-";
    }
  };

  const body = entries.map((e) => activeColumns.map((c) => cellValue(c.id, e)));

  // Explicit widths for every column except "Reason" (which absorbs the
  // remaining space) so nothing overflows or overlaps, regardless of which
  // columns are selected.
  const widthById: Record<string, number | "auto"> = {
    task: 34,
    datetime: 26,
    type: 24,
    changedBy: 26,
    startDate: 40,
    endDate: 40,
    duration: 20,
    reason: "auto",
  };
  const columnStyles: Record<number, any> = {};
  activeColumns.forEach((c, i) => {
    columnStyles[i] = { cellWidth: widthById[c.id] ?? "auto" };
  });

  autoTable(doc, {
    head: [head],
    body,
    startY: tableStartY,
    margin: { left: 14, right: 14 },
    theme: "grid",
    tableWidth: "auto",
    headStyles: {
      fillColor: [226, 232, 240], // slate-200 — a bit darker for contrast
      textColor: [15, 23, 42], // slate-900
      fontStyle: "bold",
      lineColor: [203, 213, 225],
      lineWidth: 0.1,
    },
    bodyStyles: {
      textColor: [30, 41, 59], // slate-800 — darker body text
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] }, // slate-50
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      overflow: "linebreak",
      valign: "middle",
    },
    columnStyles,
  });

  const fileName = options?.fileName || `${title.replace(/[^a-z0-9]+/gi, "_")}_${new Date().toISOString().split("T")[0]}.pdf`;
  doc.save(fileName);
}

// Simple PDF export utility using html2canvas and jspdf
export const exportToPDF = async (elementId: string, fileName: string) => {
  try {
    // For now, we'll use a simple approach - download as CSV/JSON
    // Full PDF support would require html2pdf library
    const element = document.getElementById(elementId);
    if (!element) {
      console.error("Element not found");
      return;
    }

    // Convert table to CSV if it exists
    const tables = element.querySelectorAll("table");
    if (tables.length > 0) {
      let csvContent = "data:text/csv;charset=utf-8,";
      tables.forEach((table) => {
        const rows = table.querySelectorAll("tr");
        rows.forEach((row) => {
          const cells = row.querySelectorAll("td, th");
          const rowData = Array.from(cells)
            .map((cell) => `"${cell.textContent?.trim()}"`)
            .join(",");
          csvContent += rowData + "\n";
        });
      });

      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `${fileName}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Fallback: copy text content
    const text = element.textContent || "";
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Export failed:", error);
  }
};

export const downloadAsJSON = (data: any, fileName: string) => {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileName}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};