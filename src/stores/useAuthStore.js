import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '../lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const organizations = ref([])
  const currentOrganizationId = ref(null)

  const currentOrganization = computed(
    () => organizations.value.find((o) => o.id === currentOrganizationId.value) || null
  )

  async function loadOrganizations() {
    if (!user.value) {
      organizations.value = []
      currentOrganizationId.value = null
      return
    }
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization:organizations(id, name)')
      .eq('user_id', user.value.id)
    if (error) {
      console.error('[auth] loadOrganizations', error)
      organizations.value = []
      return
    }
    organizations.value = (data || []).map((row) => row.organization).filter(Boolean)
    if (!currentOrganizationId.value && organizations.value[0]) {
      currentOrganizationId.value = organizations.value[0].id
    }
  }

  async function init() {
    const { data } = await supabase.auth.getSession()
    user.value = data.session?.user || null
    await loadOrganizations()
    supabase.auth.onAuthStateChange(async (_event, session) => {
      user.value = session?.user || null
      await loadOrganizations()
    })
  }

  function setCurrentOrganization(id) {
    currentOrganizationId.value = id
  }

  return {
    user,
    organizations,
    currentOrganizationId,
    currentOrganization,
    init,
    setCurrentOrganization
  }
})
