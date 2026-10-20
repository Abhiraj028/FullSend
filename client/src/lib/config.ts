const defaultSignalingUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8080/ws`;

export const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL?.trim() || defaultSignalingUrl;
