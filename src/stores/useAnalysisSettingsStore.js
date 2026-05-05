import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useAuthStore } from './useAuthStore'

export const DEFAULT_SYSTEM_PROMPT = `Tu es un auditeur Qualiopi expérimenté. Tu analyses des documents de formation strictement au regard du référentiel national qualité (Qualiopi).
Règles impératives :

tu analyses uniquement le type de document fourni
tu identifies exclusivement :
les éléments manquants
ou insuffisamment formalisés
toute absence ou ambiguïté = non-conformité potentielle
tu te réfères explicitement aux indicateurs Qualiopi concernés (ex. I.1, I.5, I.30…), sans les expliquer
tu ne reformules jamais le contenu existant
tu ne fais aucun rappel théorique
tu ne proposes aucune recommandation hors Qualiopi
tu n'émets aucune hypothèse favorable
si un élément n'est pas objectivement rattachable à Qualiopi, tu l'indiques explicitement Le ton doit être :
factuel
auditables
exploitable tel quel dans un rapport d'audit Contraintes de réponses :
phrase d'introduction obligatoire : Voici l'analyse :
format : liste courte et structurée
chaque point doit :
identifier l'élément manquant ou insuffisant
mentionner l'indicateur Qualiopi concerné
donner 1 ou 2 exemples maximum, factuels et auditables
aucune conclusion générale
aucun contenu hors Qualiopi
[Inclure ici les règles détaillées par type de document : Programme de formation, Règlement intérieur, Analyse du besoin, Scénario pédagogique, Organigramme, Contrat de sous-traitance, Charte qualité (5 blocs), Certificat de formation, Questionnaire de satisfaction (stagiaires/formateurs/financeurs), Autre — voir version complète fournie par le donneur d'ordre.]`

export const DEFAULT_PRICE_PER_ANALYSIS = 3

const PROMPT_PREFIX = 'qualiopi:system_prompt:'
const PRICE_PREFIX = 'qualiopi:price_per_analysis:'

function userKey(prefix, userId) {
  return userId ? `${prefix}${userId}` : null
}

function readPrompt(userId) {
  const key = userKey(PROMPT_PREFIX, userId)
  if (!key) return DEFAULT_SYSTEM_PROMPT
  try {
    return localStorage.getItem(key) ?? DEFAULT_SYSTEM_PROMPT
  } catch {
    return DEFAULT_SYSTEM_PROMPT
  }
}

function readPrice(userId) {
  const key = userKey(PRICE_PREFIX, userId)
  if (!key) return DEFAULT_PRICE_PER_ANALYSIS
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return DEFAULT_PRICE_PER_ANALYSIS
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_PRICE_PER_ANALYSIS
  } catch {
    return DEFAULT_PRICE_PER_ANALYSIS
  }
}

export const useAnalysisSettingsStore = defineStore('analysisSettings', () => {
  const auth = useAuthStore()
  const webhookUrl = ref(import.meta.env.VITE_N8N_HOOK_ANALYZE_DOC || '')
  const systemPrompt = ref(readPrompt(auth.user?.id))
  const pricePerAnalysis = ref(readPrice(auth.user?.id))

  watch(
    () => auth.user?.id,
    (id) => {
      systemPrompt.value = readPrompt(id)
      pricePerAnalysis.value = readPrice(id)
    }
  )

  function saveSystemPrompt(text) {
    const key = userKey(PROMPT_PREFIX, auth.user?.id)
    if (!key) throw new Error('Utilisateur non authentifié.')
    localStorage.setItem(key, text)
    systemPrompt.value = text
  }

  function resetSystemPrompt() {
    const key = userKey(PROMPT_PREFIX, auth.user?.id)
    if (key) localStorage.removeItem(key)
    systemPrompt.value = DEFAULT_SYSTEM_PROMPT
  }

  function setPricePerAnalysis(value) {
    const n = Number(value)
    const safe = Number.isFinite(n) && n >= 0 ? n : DEFAULT_PRICE_PER_ANALYSIS
    const key = userKey(PRICE_PREFIX, auth.user?.id)
    if (key) localStorage.setItem(key, String(safe))
    pricePerAnalysis.value = safe
  }

  return {
    webhookUrl,
    systemPrompt,
    pricePerAnalysis,
    saveSystemPrompt,
    resetSystemPrompt,
    setPricePerAnalysis
  }
})
