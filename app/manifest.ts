import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ev Programi",
    short_name: "Ev Programi",
    description: "Tablet odaklı aile görev yönetimi",
    display: "standalone",
    orientation: "landscape",
    background_color: "#f4efe8",
    theme_color: "#0f172a",
    lang: "tr",
    start_url: "/"
  };
}
