export function Footer() {
  const year = 2026;
  return (
    <footer className="site-footer">
      <div className="foot-inner">
        <div className="foot-brand">
          <div className="foot-logo"><span className="fm">◈</span> NIAT&nbsp;Records</div>
          <p>Real-time student records for NIAT&apos;s collaborated universities. Google Sheets → live dashboard, synced every minute.</p>
          <div className="foot-badges">
            <span>NxtWave Institute of Advanced Technologies</span>
          </div>
        </div>
        <div className="foot-cols">
          <div className="foot-col">
            <h4>Platform</h4>
            <a href="/">Colleges</a>
            <a href="/">Semesters</a>
            <a href="/">Student records</a>
          </div>
          <div className="foot-col">
            <h4>Data</h4>
            <span>Google Sheets · read-only</span>
            <span>Supabase · realtime</span>
            <span>Synced every 60s</span>
          </div>
          <div className="foot-col">
            <h4>NIAT</h4>
            <a href="https://www.niatindia.com/" target="_blank" rel="noopener noreferrer">niatindia.com</a>
            <span>Collaborated universities</span>
            <span>Batch 2025</span>
          </div>
        </div>
      </div>
      <div className="foot-bottom">
        <span>© {year} NxtWave · NIAT Records</span>
        <span className="foot-live"><i /> All systems synced</span>
      </div>
    </footer>
  );
}
