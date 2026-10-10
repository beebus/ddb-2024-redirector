<template>
  <div class="options">
    <header>
      <h1>⚔️ DDB 2024 Redirector — Mappings</h1>
      <p class="subtitle">Manage custom 2014 → 2024 ID mappings. Built-in mappings are always active.</p>
    </header>

    <!-- Add new mapping -->
    <section class="card">
      <h2>Add Custom Mapping</h2>
      <div class="form-row">
        <select v-model="newEntry.contentType">
          <option v-for="type in ALL_CONTENT_TYPES" :key="type" :value="type">
            {{ CONTENT_TYPE_LABELS[type] }}
          </option>
        </select>
        <input v-model="newEntry.name" placeholder="Name (e.g. Fireball)" />
        <input v-model="newEntry.id2014" placeholder="2014 ID (e.g. 2027)" maxlength="10" />
        <input v-model="newEntry.id2024" placeholder="2024 ID (e.g. 2619208)" maxlength="10" />
        <button class="btn-primary" @click="addEntry" :disabled="!canAdd">Add</button>
      </div>
      <p v-if="addError" class="error">{{ addError }}</p>
    </section>

    <!-- User mappings -->
    <section class="card" v-if="hasUserMappings">
      <h2>Your Custom Mappings</h2>
      <div v-for="type in ALL_CONTENT_TYPES" :key="type">
        <div v-if="userMappings[type]?.length">
          <h3>{{ CONTENT_TYPE_LABELS[type] }}</h3>
          <table>
            <thead>
            <tr><th>Name</th><th>2014 ID</th><th>2024 ID</th><th></th></tr>
            </thead>
            <tbody>
            <tr v-for="(entry, i) in userMappings[type]" :key="entry.id2014">
              <td>{{ entry.name }}</td>
              <td><code>{{ entry.id2014 }}</code></td>
              <td><code>{{ entry.id2024 }}</code></td>
              <td><button class="btn-danger" @click="removeEntry(type, i)">Remove</button></td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- Built-in mappings reference -->
    <section class="card">
      <h2>Built-in Mappings <span class="badge">{{ builtinCount }} entries</span></h2>
      <p class="muted">These are always active and cannot be removed. Add a custom entry with the same 2014 ID to override one.</p>
      <div v-for="type in ALL_CONTENT_TYPES" :key="type">
        <div v-if="builtinMappings[type]?.length">
          <h3>{{ CONTENT_TYPE_LABELS[type] }} ({{ builtinMappings[type].length }})</h3>
          <table class="dim">
            <thead>
            <tr><th>Name</th><th>2014 ID</th><th>2024 ID</th></tr>
            </thead>
            <tbody>
            <tr v-for="entry in builtinMappings[type]" :key="entry.id2014">
              <td>{{ entry.name }}</td>
              <td><code>{{ entry.id2014 }}</code></td>
              <td><code>{{ entry.id2024 }}</code></td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, onMounted } from 'vue'
import { ALL_CONTENT_TYPES, CONTENT_TYPE_LABELS } from '../shared/types'
import type { ContentType, MappingEntry, MappingTable } from '../shared/types'
import { BUILTIN_MAPPINGS } from '../shared/mappings'
import { getUserMappings, saveUserMappings } from '../shared/storage'

const builtinMappings = BUILTIN_MAPPINGS
const builtinCount = computed(() =>
    ALL_CONTENT_TYPES.reduce((sum, t) => sum + (builtinMappings[t]?.length ?? 0), 0)
)

const userMappings = reactive<Partial<MappingTable>>({})
const hasUserMappings = computed(() =>
    ALL_CONTENT_TYPES.some((t) => (userMappings[t]?.length ?? 0) > 0)
)

const newEntry = reactive({
  contentType: 'spells' as ContentType,
  name: '',
  id2014: '',
  id2024: '',
})

const addError = reactive({ value: '' })
const canAdd = computed(() =>
    newEntry.name.trim() && /^\d+$/.test(newEntry.id2014) && /^\d+$/.test(newEntry.id2024)
)

onMounted(async () => {
  const stored = await getUserMappings()
  Object.assign(userMappings, stored)
})

async function addEntry() {
  const type = newEntry.contentType
  if (!userMappings[type]) userMappings[type] = []
  const existing = userMappings[type]!.find((e) => e.id2014 === newEntry.id2014.trim())
  if (existing) {
    addError.value = `A mapping for 2014 ID ${newEntry.id2014} already exists.`
    return
  }
  const entry: MappingEntry = {
    id2014: newEntry.id2014.trim(),
    id2024: newEntry.id2024.trim(),
    name: newEntry.name.trim(),
  }
  userMappings[type]!.push(entry)
  await saveUserMappings({ ...userMappings })
  newEntry.name = ''
  newEntry.id2014 = ''
  newEntry.id2024 = ''
  addError.value = ''
}

async function removeEntry(type: ContentType, index: number) {
  userMappings[type]!.splice(index, 1)
  await saveUserMappings({ ...userMappings })
}
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; background: #f5f0e8; color: #1a1a2e; padding: 24px; }

.options { max-width: 900px; margin: 0 auto; }

header { margin-bottom: 24px; }
h1 { font-size: 22px; color: #7b2d00; }
.subtitle { color: #666; margin-top: 4px; }

.card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
h2 { font-size: 16px; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
h3 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #7b2d00; margin: 14px 0 6px; }

.form-row { display: flex; gap: 8px; flex-wrap: wrap; }
select, input { border: 1px solid #ddd; border-radius: 6px; padding: 7px 10px; font-size: 13px; flex: 1; min-width: 100px; }
select { flex: 0 0 auto; }

.btn-primary { background: #7b2d00; color: white; border: none; border-radius: 6px; padding: 7px 16px; cursor: pointer; font-size: 13px; font-weight: 600; white-space: nowrap; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-primary:hover:not(:disabled) { background: #a03d00; }
.btn-danger { background: none; border: 1px solid #dc3545; color: #dc3545; border-radius: 4px; padding: 3px 10px; cursor: pointer; font-size: 12px; }
.btn-danger:hover { background: #dc3545; color: white; }

.error { color: #dc3545; font-size: 12px; margin-top: 8px; }
.muted { color: #888; font-size: 12px; margin-bottom: 10px; }

.badge { background: #f0e8d8; color: #7b2d00; border-radius: 10px; padding: 2px 8px; font-size: 11px; font-weight: 600; }

table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #e8dfd0; font-weight: 600; color: #555; font-size: 11px; text-transform: uppercase; }
td { padding: 6px 8px; border-bottom: 1px solid #f0ebe0; }
tr:last-child td { border-bottom: none; }
code { background: #f5f0e8; padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 12px; }
table.dim { opacity: 0.7; }
</style>