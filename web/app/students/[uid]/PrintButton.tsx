'use client';
export function PrintButton() {
  return (
    <button className="ghost no-print" onClick={() => window.print()} title="Print or save as PDF">
      ⧉ Print / Save PDF
    </button>
  );
}
