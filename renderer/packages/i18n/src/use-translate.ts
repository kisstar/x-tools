import { useTranslation } from "react-i18next"

function useTranslate(ns?: string) {
  return useTranslation(ns ?? "common")
}

export { useTranslate }
