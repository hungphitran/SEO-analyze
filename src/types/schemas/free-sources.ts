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
