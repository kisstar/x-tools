import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import enCommon from "../locales/en/common.json"
import zhCNCommon from "../locales/zh-CN/common.json"

function createI18n(language?: string) {
  const instance = i18n.createInstance()

  instance.use(initReactI18next).init({
    resources: {
      en: { common: enCommon },
      "zh-CN": { common: zhCNCommon },
    },
    lng: language ?? navigator.language,
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
  })

  return instance
}

export { createI18n }
