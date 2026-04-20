import { useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { SUPPORTED_LANGUAGES, type SupportedLanguageCode } from "@/i18n/config";

const LANGUAGE_NAMES: Record<SupportedLanguageCode, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
};

/**
 * useLanguage — single source of truth for the user's language.
 * - Reads `preferred_language` from the profile on login and applies it to i18next.
 * - Exposes `setLanguage(code)` which updates BOTH i18next + the profile row.
 * - Exposes `languageName` (English-language label, used when prompting the AI).
 */
export function useLanguage() {
  const { user } = useAuth();
  const { i18n } = useTranslation();

  // On user login, sync language from profile.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("preferred_language")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const lang = (data?.preferred_language as SupportedLanguageCode | undefined) ?? "en";
      if (lang && lang !== i18n.language) {
        i18n.changeLanguage(lang);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setLanguage = useCallback(
    async (code: SupportedLanguageCode) => {
      await i18n.changeLanguage(code);
      if (user) {
        await supabase.from("profiles").update({ preferred_language: code }).eq("user_id", user.id);
      }
    },
    [i18n, user],
  );

  const current = (i18n.language as SupportedLanguageCode) || "en";
  return {
    language: current,
    languageName: LANGUAGE_NAMES[current] ?? "English",
    setLanguage,
    supported: SUPPORTED_LANGUAGES,
  };
}

export { LANGUAGE_NAMES };
