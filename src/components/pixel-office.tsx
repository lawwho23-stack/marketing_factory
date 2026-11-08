"use client";
import { type CSSProperties } from "react";
import { ArrowUpRight } from "lucide-react";
export interface OfficeWorker {
  id: string;
  name: string;
  role: string;
  color: string;
  initials: string;
  status: string;
  task: { id: string; title: string; status: string } | null;
  last_reported: string | null;
}
const labels: Record<string, string> = {
  idle: "Ready when you are",
  failed: "Needs attention",
  unknown: "Awaiting remote report",
  running: "Working",
  waiting_review: "Needs your review",
  manual: "Manual workspace",
  stale: "Last report is stale",
  queued: "Queued",
};
export function PixelOffice({
  workers,
  onWorker,
}: {
  workers: OfficeWorker[];
  onWorker: (worker: OfficeWorker) => void;
}) {
  return (
    <div className="office-scroll">
      <div className="pixel-office" aria-label="Your factory office">
        <div className="office-wall">
          <span className="wall-line" />
          <div className="wall-window window-one">
            <i />
            <i />
            <i />
            <i />
            <b />
          </div>
          <div className="wall-sign">
            MAKE GOOD
            <br />
            <strong>THINGS.</strong>
          </div>
          <div className="wall-window window-two">
            <i />
            <i />
            <i />
            <i />
            <b />
          </div>
          <div className="wall-clock">
            <i />
            <b />
          </div>
        </div>
        <div className="office-floor" />
        <div className="office-rug" />
        <div className="office-rug second" />
        <div className="shelf">
          <i />
          <i />
          <i />
          <i />
          <b />
        </div>
        <div className="floor-plant plant-one">
          <span />
          <i />
        </div>
        <div className="floor-plant plant-two">
          <span />
          <i />
        </div>
        <div className="coffee-table">
          <span />
          <i />
        </div>
        {workers.map((worker, index) => (
          <button
            key={worker.id}
            className={`office-station station-${index} ${worker.status === "running" ? "is-working" : ""}`}
            style={{ "--worker-color": worker.color } as CSSProperties}
            onClick={() => onWorker(worker)}
            aria-label={`Open ${worker.name}: ${labels[worker.status] ?? worker.status}`}
          >
            <span className={`station-bubble state-${worker.status}`}>
              <i />
              {labels[worker.status] ?? worker.status}
            </span>
            <span className="desk-shadow" />
            <span className="desk-back" />
            <span className="desk-top">
              <span className="computer">
                <i />
                <b />
              </span>
              <span className="keyboard" />
              <span className="desk-notebook" />
              <span className="desk-mug" />
            </span>
            <span className="desk-legs" />
            <span className="chair" />
            <span className="pixel-person">
              <i className="person-hair" />
              <i className="person-head" />
              <i className="person-shirt" />
              <i className="person-arm left" />
              <i className="person-arm right" />
              <i className="person-legs" />
            </span>
            <span className="station-name">
              {worker.name}
              <ArrowUpRight size={11} />
            </span>
          </button>
        ))}
        <span className="office-coordinate">FACTORY FLOOR · 01</span>
        <div className="office-door" />
      </div>
    </div>
  );
}
