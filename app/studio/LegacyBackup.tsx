import { useEffect, useState } from "react";
export default function LegacyBackup() {
  const [backup, setBackup] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem("vage-projects");
      if (raw && JSON.parse(raw).length) setBackup(raw);
    } catch {}
  }, []);
  if (!backup) return null;
  return (
    <div className="notice">
      <div>
        <strong>Earlier project snapshots are preserved</strong>
        <p>
          The previous editor saved HTML, not media files. Download a backup
          before recreating these projects. Your originals have not been
          changed.
        </p>
        <button
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob([backup], { type: "application/json" }),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = "vage-legacy-projects-backup.json";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download legacy backup
        </button>
      </div>
    </div>
  );
}
