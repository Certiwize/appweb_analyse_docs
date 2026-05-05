import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const DEFAULT_DOC_TYPES = [
  { code: 'PROGRAMME_FORMATION', i18nKey: 'analysis.types.PROGRAMME_FORMATION', isDefault: true },
  { code: 'CONVENTION_FORMATION', i18nKey: 'analysis.types.CONVENTION_FORMATION', isDefault: true },
  { code: 'CV_FORMATEUR', i18nKey: 'analysis.types.CV_FORMATEUR', isDefault: true },
  { code: 'JUSTIFICATIF_COMPETENCES', i18nKey: 'analysis.types.JUSTIFICATIF_COMPETENCES', isDefault: true },
  { code: 'REGLEMENT_INTERIEUR', i18nKey: 'analysis.types.REGLEMENT_INTERIEUR', isDefault: true },
  { code: 'ANALYSE_DU_BESOIN', i18nKey: 'analysis.types.ANALYSE_DU_BESOIN', isDefault: true },
  { code: 'SCENARIO_PEDAGOGIQUE', i18nKey: 'analysis.types.SCENARIO_PEDAGOGIQUE', isDefault: true },
  { code: 'SUPPORT_FORMATION', i18nKey: 'analysis.types.SUPPORT_FORMATION', isDefault: true },
  { code: 'QUIZ_POSITIONNEMENT', i18nKey: 'analysis.types.QUIZ_POSITIONNEMENT', isDefault: true },
  { code: 'QUIZ_VALIDATION', i18nKey: 'analysis.types.QUIZ_VALIDATION', isDefault: true },
  { code: 'PROCEDURE', i18nKey: 'analysis.types.PROCEDURE', isDefault: true },
  { code: 'ORGANIGRAMME', i18nKey: 'analysis.types.ORGANIGRAMME', isDefault: true },
  { code: 'CONTRAT_SOUSTRAITANCE', i18nKey: 'analysis.types.CONTRAT_SOUSTRAITANCE', isDefault: true },
  { code: 'CHARTE_QUALITE', i18nKey: 'analysis.types.CHARTE_QUALITE', isDefault: true },
  { code: 'CERTIFICAT_FORMATION', i18nKey: 'analysis.types.CERTIFICAT_FORMATION', isDefault: true },
  { code: 'QUESTIONNAIRE_SATISFACTION', i18nKey: 'analysis.types.QUESTIONNAIRE_SATISFACTION', isDefault: true }
]

const STORAGE_KEY = 'app-doc-types'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export const useDocTypesStore = defineStore('docTypes', () => {
  const types = ref(loadFromStorage() || DEFAULT_DOC_TYPES.map((t) => ({ ...t })))

  watch(
    types,
    (val) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
      } catch (err) {
        console.warn('[docTypes] localStorage save failed', err)
      }
    },
    { deep: true }
  )

  function addType({ code, label }) {
    if (!code || !label) throw new Error('Code et libellé requis.')
    if (types.value.some((t) => t.code === code)) {
      throw new Error('Ce code existe déjà.')
    }
    types.value.push({ code, label, isDefault: false })
  }

  function renameType(code, newLabel) {
    const t = types.value.find((x) => x.code === code)
    if (!t) return
    t.label = newLabel
    if (t.isDefault) {
      t.i18nKey = null
    }
  }

  function removeType(code) {
    types.value = types.value.filter((t) => t.code !== code || t.isDefault)
  }

  function resetToDefaults() {
    types.value = DEFAULT_DOC_TYPES.map((t) => ({ ...t }))
  }

  function getTypesForDropdown(t) {
    const items = types.value.map((entry) => ({
      code: entry.code,
      name: entry.i18nKey ? t(entry.i18nKey) : entry.label || entry.code
    }))
    items.push({ code: 'custom', name: t('analysis.types.custom') })
    return items
  }

  return {
    types,
    addType,
    renameType,
    removeType,
    resetToDefaults,
    getTypesForDropdown
  }
})
