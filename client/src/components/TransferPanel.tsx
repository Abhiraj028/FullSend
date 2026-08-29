import type { ChangeEvent } from "react";
import type { FileOfferMessage } from "../lib/protocol";

type OutgoingOfferView = {
    file: File;
    status: string;
};

type CompletedDownload = {
    name: string;
    url: string;
};

type TransferPanelProps = {
    controlChannelStatus: RTCDataChannelState | "not-created";
    outgoingOffer: OutgoingOfferView | null;
    incomingOffer: FileOfferMessage | null;
    incomingDecision: "pending" | "accepted" | "rejected" | null;
    verificationStatus: "idle" | "verifying" | "verified" | "failed";
    sentBytes: number;
    receivedBytes: number;
    senderCompletedBytes: number | null;
    completedDownload: CompletedDownload | null;
    onOfferSelectedFile: (event: ChangeEvent<HTMLInputElement>) => void;
    onSendFile: () => Promise<void>;
    onAcceptIncomingOffer: () => void;
    onRejectIncomingOffer: () => void;
};

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;

    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function TransferPanel({
    controlChannelStatus,
    outgoingOffer,
    incomingOffer,
    incomingDecision,
    verificationStatus,
    sentBytes,
    receivedBytes,
    senderCompletedBytes,
    completedDownload,
    onOfferSelectedFile,
    onSendFile,
    onAcceptIncomingOffer,
    onRejectIncomingOffer,
}: TransferPanelProps) {
    const receiverHasAllBytes =
        incomingOffer &&
        senderCompletedBytes === incomingOffer.size &&
        receivedBytes === incomingOffer.size;

    return (
        <section className="transfer-panel">
            {controlChannelStatus !== "open" ? (
                <div className="transfer-empty">
                    <p className="label">Transfer workspace</p>
                    <p className="hint">Waiting for the direct peer connection.</p>
                </div>
            ) : (
                <>
                    <div className="file-picker">
                        <div>
                            <p className="label">Send a file</p>
                            <p className="hint">Files travel directly to the approved peer.</p>
                        </div>
                        <label className="file-button">
                            Choose file
                            <input type="file" onChange={onOfferSelectedFile} />
                        </label>
                    </div>

                    {outgoingOffer && (
                        <div className="transfer-card">
                            <div className="transfer-heading">
                                <div>
                                    <p className="label">Outgoing file</p>
                                    <p className="file-name">{outgoingOffer.file.name}</p>
                                </div>
                                <span className="transfer-state">{outgoingOffer.status}</span>
                            </div>
                            <p className="hint">
                                {formatBytes(outgoingOffer.file.size)} · Ready for direct transfer
                            </p>

                            {outgoingOffer.status === "accepted" && (
                                <button onClick={() => void onSendFile()}>
                                    Send file
                                </button>
                            )}

                            {outgoingOffer.status === "sending" && (
                                <p className="hint">
                                    Sending: {formatBytes(sentBytes)} /{" "}
                                    {formatBytes(outgoingOffer.file.size)}
                                </p>
                            )}

                            {outgoingOffer.status === "hashing" && (
                                <p className="hint">Calculating SHA-256…</p>
                            )}

                            {outgoingOffer.status === "complete-sent" && (
                                <p className="hint">
                                    All chunks sent. Waiting for receiver verification.
                                </p>
                            )}

                            {outgoingOffer.status === "verified" && (
                                <p className="hint">Peer verified the file successfully.</p>
                            )}
                        </div>
                    )}

                    {incomingOffer && (
                        <div className="transfer-card">
                            <div className="transfer-heading">
                                <div>
                                    <p className="label">Incoming file</p>
                                    <p className="file-name">{incomingOffer.name}</p>
                                </div>
                                <span className="transfer-state">{incomingDecision ?? "pending"}</span>
                            </div>
                            <p className="hint">
                                {formatBytes(incomingOffer.size)} ·{" "}
                                {incomingOffer.mimeType || "unknown file type"}
                            </p>

                            {incomingDecision === "pending" && (
                                <div className="actions">
                                    <button onClick={onAcceptIncomingOffer}>Accept</button>
                                    <button
                                        className="secondary-button"
                                        onClick={onRejectIncomingOffer}
                                    >
                                        Reject
                                    </button>
                                </div>
                            )}

                            {incomingDecision === "accepted" && (
                                <p className="hint">
                                    Receiving: {formatBytes(receivedBytes)} /{" "}
                                    {formatBytes(incomingOffer.size)}
                                    {receiverHasAllBytes && " · All chunks received."}
                                </p>
                            )}

                            {verificationStatus === "verifying" && (
                                <p className="hint">Verifying SHA-256…</p>
                            )}

                            {verificationStatus === "verified" && (
                                <p className="hint">Verified. Ready to download.</p>
                            )}

                            {verificationStatus === "failed" && (
                                <p className="hint">Verification failed.</p>
                            )}

                            {verificationStatus === "verified" &&
                                completedDownload && (
                                    <a
                                        className="download-link"
                                        href={completedDownload.url}
                                        download={completedDownload.name}
                                    >
                                        Download {completedDownload.name}
                                    </a>
                                )}

                            {incomingDecision === "rejected" && (
                                <p className="hint">Offer rejected.</p>
                            )}
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
