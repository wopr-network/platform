import { SITE_URL } from "@core/lib/api-config";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL;
  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${base}/how-it-works`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/the-real-cost`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/the-learning-loop`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/vibe-coding-vs-engineering`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/why-not-prompts`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/proof`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/pricing`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/login`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.5 },
  ];
}
