import { Globe } from "@x-tools/icons"
import { useTranslation } from "react-i18next"

function LocaleToggle() {
  const { i18n } = useTranslation()

  const toggle = () => {
    const next = i18n.language === "zh-CN" ? "en" : "zh-CN"
    i18n.changeLanguage(next)
  }

  return (
    <button
      className="flex items-center justify-center w-7 h-7 rounded-md border border-hairline hover:border-hairline-strong transition-colors cursor-pointer"
      onClick={toggle}
      title={`Language: ${i18n.language}`}
    >
      <Globe size={14} className="text-body" />
    </button>
  )
}

export { LocaleToggle }
