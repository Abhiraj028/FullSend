import type { BatchFile } from "../../lib/protocol";
import type { CompletedDownload } from "../../lib/transfer";
import { formatBytes } from "../../lib/format";

export function FileList({
  files,
  downloads = [],
}: {
  files: BatchFile[];
  downloads?: CompletedDownload[];
}) {
  return (
    <ul className="file-list">
      {files.map((file) => {
        const download = downloads.find(
          (item) => item.transferId === file.transferId,
        );

        return (
          <li key={file.transferId}>
            {download ? (
              <a
                className="inline-download"
                href={download.url}
                download={file.name}
              >
                {file.name}
              </a>
            ) : (
              file.name
            )}{" "}
            · {formatBytes(file.size)}
          </li>
        );
      })}
    </ul>
  );
}

export function TransferProgress({
  value,
  total,
}: {
  value: number;
  total: number;
}) {
  const percent =
    total === 0 ? 100 : Math.min(100, Math.round((value / total) * 100));

  return (
    <div className="progress-row">
      <div className="progress-track">
        <span style={{ width: `${percent}%` }} />
      </div>
      <span>{percent}%</span>
    </div>
  );
}
