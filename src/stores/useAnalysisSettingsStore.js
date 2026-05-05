import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
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

export const useAnalysisSettingsStore = defineStore('analysisSettings', () => {
  const auth = useAuthStore()
  const webhookUrl = ref(import.meta.env.VITE_N8N_WEBHOOK_URL || '')
  const systemPrompt = ref(DEFAULT_SYSTEM_PROMPT)
  const loading = ref(false)
  const error = ref(null)

  function orgId() {
    const id = auth.currentOrganizationId
    if (!id) throw new Error('Aucune organisation active.')
    return id
  }

  async function fetchWebhookUrl() {
    try {
      const { data, error: err } = await supabase
        .from('analysis_settings')
        .select('value')
        .eq('organization_id', orgId())
        .eq('key', 'webhook_url')
        .order('updated_at', { ascending: false })
        .limit(1)
      if (err) throw err
      webhookUrl.value = data?.[0]?.value || import.meta.env.VITE_N8N_WEBHOOK_URL || ''
    } catch (err) {
      console.error('[settings] fetchWebhookUrl', err)
      webhookUrl.value = import.meta.env.VITE_N8N_WEBHOOK_URL || ''
    }
    return webhookUrl.value
  }

  async function fetchSystemPrompt() {
    try {
      const { data, error: err } = await supabase
        .from('analysis_settings')
        .select('value')
        .eq('organization_id', orgId())
        .eq('key', 'system_prompt')
        .order('updated_at', { ascending: false })
        .limit(1)
      if (err) throw err
      systemPrompt.value = data?.[0]?.value || DEFAULT_SYSTEM_PROMPT
    } catch (err) {
      console.error('[settings] fetchSystemPrompt', err)
      systemPrompt.value = DEFAULT_SYSTEM_PROMPT
    }
    return systemPrompt.value
  }

  async function saveSystemPrompt(text) {
    loading.value = true
    error.value = null
    try {
      const { error: err } = await supabase.from('analysis_settings').insert({
        organization_id: orgId(),
        key: 'system_prompt',
        value: text,
        is_default: false,
        updated_by: auth.user?.id ?? null
      })
      if (err) throw err
      systemPrompt.value = text
    } catch (err) {
      error.value = err.message || 'Échec de l\'enregistrement du prompt.'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function saveWebhookUrl(url) {
    loading.value = true
    error.value = null
    try {
      const { error: err } = await supabase.from('analysis_settings').insert({
        organization_id: orgId(),
        key: 'webhook_url',
        value: url,
        is_default: false,
        updated_by: auth.user?.id ?? null
      })
      if (err) throw err
      webhookUrl.value = url
    } catch (err) {
      error.value = err.message || 'Échec de l\'enregistrement de l\'URL.'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function resetSystemPrompt() {
    loading.value = true
    error.value = null
    try {
      const { error: err } = await supabase
        .from('analysis_settings')
        .delete()
        .eq('organization_id', orgId())
        .eq('key', 'system_prompt')
        .eq('is_default', false)
      if (err) throw err
      await fetchSystemPrompt()
    } catch (err) {
      error.value = err.message || 'Échec de la réinitialisation.'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    webhookUrl,
    systemPrompt,
    loading,
    error,
    fetchWebhookUrl,
    fetchSystemPrompt,
    saveSystemPrompt,
    saveWebhookUrl,
    resetSystemPrompt
  }
})
