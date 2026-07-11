import { Activity, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

interface Status {
  installedAt?: string;
  capturedRequestCount: number;
}

export function Popup() {
  const [status, setStatus] = useState<Status>({ capturedRequestCount: 0 });

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "api-cartographer:get-status" }, (response?: Status) => {
      if (response) {
        setStatus(response);
      }
    });
  }, []);

  return (
    <main className="popup-shell">
      <header>
        <Activity size={18} />
        <div>
          <h1>API Cartographer</h1>
          <p>{status.capturedRequestCount} requests stored</p>
        </div>
      </header>
      <div className="instruction">
        <ExternalLink size={15} />
        <span>Open DevTools and select the API Cartographer panel.</span>
      </div>
      {status.installedAt ? <p className="subtle">Installed {new Date(status.installedAt).toLocaleDateString()}</p> : null}
    </main>
  );
}