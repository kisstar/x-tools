import { useEffect, useState, type ReactNode } from "react"
import { I18nextProvider } from "react-i18next"
import { createI18n } from "@x-tools/i18n"
import type { i18n } from "i18next"

interface I18nProviderProps {
  readonly children: ReactNode
}

const STORAGE_KEY = "x-tools-locale"

function I18nProvider({ children }: I18nProviderProps) {
  const [instance] = useState<i18n>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return createI18n(stored ?? undefined)
  })

  useEffect(() => {
    const handleLanguageChanged = (lng: string) => {
      localStorage.setItem(STORAGE_KEY, lng)
      document.documentElement.setAttribute("lang", lng)
    }
    instance.on("languageChanged", handleLanguageChanged)
    return () => {
      instance.off("languageChanged", handleLanguageChanged)
    }
  }, [instance])

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>
}

export { I18nProvider }
