import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)

  async function init() {
    const { data } = await supabase.auth.getSession()
    user.value = data.session?.user || null
    supabase.auth.onAuthStateChange((_event, session) => {
      user.value = session?.user || null
    })
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    user.value = data.user
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    user.value = null
  }

  return {
    user,
    init,
    signIn,
    signOut
  }
})
