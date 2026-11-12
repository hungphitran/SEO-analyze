import { z } from "zod";

export const freeSourcesProjectSchema = z.object({
  projectId: z.string().min(1),
});

export const listBingSitesSchema = z.object({
  projectId: z.string().min(1),
  apiKey: z.string().min(1).max(512),
});

export const saveBingConnectionSchema = z.object({
  projectId: z.string().min(1),
  apiKey: z.string().min(1).max(512),
  siteUrl: z.string().min(1).max(2048),
});

export const cruxVitalsSchema = z.object({
  projectId: z.string().min(1),
  formFactor: z.enum(["ALL", "PHONE", "DESKTOP"]).optional(),
});

export const openPageRankSchema = z.object({
  projectId: z.string().min(1),
  domain: z.string().trim().min(1).max(2048),
});
