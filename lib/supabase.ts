import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database";

function projectUrl(value: string | undefined) {
  const url = value?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;

  try {
    const parsed = new URL(url);
    return parsed.username || parsed.password || parsed.search || parsed.hash ? null : parsed.href;
  } catch {
    return null;
  }
}

const url = projectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
// Production defaults identify this portal's Supabase project. This publishable
// key is intended for browsers; database access is enforced by Supabase RLS.
const productionProject = {
  url: "https://rmqrjhgutqcqttixyfqs.supabase.co",
  key: "sb_publishable_auyVpe4BrTcCsYWhiilLXw_ehyN2JsP",
};

const connection = url && key ? { url, key }
  : process.env.NODE_ENV === "production" ? productionProject
  : null;

export const supabase = connection ? createClient<Database>(connection.url, connection.key) : null;
