<template>
  <div class="popup">
    <!-- Header -->
    <div class="header">
      <div class="header-left">
        <span class="logo">⚔️</span>
        <div>
          <div class="title">DDB 2024 Redirector</div>
          <div class="subtitle">D&amp;D Beyond Edition Switcher</div>
        </div>
      </div>
      <!-- Master toggle -->
      <label class="toggle" :title="settings.enabled ? 'Disable redirector' : 'Enable redirector'">
        <input type="checkbox" v-model="settings.enabled" @change="save" />
        <span class="slider" :class="{ active: settings.enabled }"></span>
      </label>
    </div>

    <!-- Content type toggles -->
    <div class="section" :class="{ dimmed: !settings.enabled }">
      <div class="section-label">Redirect content types</div>
      <div
        v-for="type in ALL_CONTENT_TYPES"
        :key="type"
        class="row"
      >
        <span class="type-label">{{ CONTENT_TYPE_LABELS[type] }}</span>
        <label class="toggle small">
          <input
            type="checkbox"
            :disabled="!settings.enabled"
            v-model="settings.enabledTypes[type]"
            @change="save"
          />
          <span class="slider small" :class="{ active: settings.enabledTypes[type] && settings.enabled }"></span>
        </label>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <button class="link-btn" @click="openOptions">Manage mappings →</button>
      <span class="status" :class="settings.enabled ? 'on' : 'off'">
        {{ settings.enabled ? 'Active' : 'Paused' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted } from 'vue'
import { getSettings, saveSettings } from '../shared/storage'
import { ALL_CONTENT_TYPES, CONTENT_TYPE_LABELS, DEFAULT_SETTINGS } from '../shared/types'
import type { ExtensionSettings } from '../shared/types'

const settings = reactive<ExtensionSettings>({ ...DEFAULT_SETTINGS })

onMounted(async () => {
  const stored = await getSettings()
  Object.assign(settings, stored)
})

async function save() {
  await saveSettings({ ...settings })
  // Notify content scripts
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED' }).catch(() => {
      // Tab may not have the content script (e.g. chrome:// pages) — ignore
    })
  }
}

function openOptions() {
  chrome.runtime.openOptionsPage()
}
</script>

<style scoped>
* { box-sizing: border-box; margin: 0; padding: 0; }

.popup {
  width: 280px;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: 13px;
  color: #1a1a2e;
  background: #f9f5ee;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 12px;
  background: #7b2d00;
  color: white;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo { font-size: 22px; }

.title {
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.3px;
}

.subtitle {
  font-size: 10px;
  opacity: 0.75;
  margin-top: 1px;
}

.section {
  padding: 12px 16px;
  border-bottom: 1px solid #e8dfd0;
  transition: opacity 0.2s;
}

.section.dimmed { opacity: 0.45; pointer-events: none; }

.section-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #7b2d00;
  margin-bottom: 8px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.type-label { color: #333; }

/* Toggle switch */
.toggle {
  position: relative;
  display: inline-block;
  width: 42px;
  height: 24px;
  cursor: pointer;
  flex-shrink: 0;
}

.toggle.small { width: 34px; height: 20px; }

.toggle input { opacity: 0; width: 0; height: 0; }

.slider {
  position: absolute;
  inset: 0;
  background: #ccc;
  border-radius: 24px;
  transition: background 0.2s;
}

.slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  top: 3px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.25);
}

.slider.small::before { width: 14px; height: 14px; }

.slider.active { background: #7b2d00; }

.slider.active::before { transform: translateX(18px); }
.slider.active.small::before { transform: translateX(14px); }

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
}

.link-btn {
  background: none;
  border: none;
  color: #7b2d00;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  padding: 0;
  text-decoration: underline;
}

.link-btn:hover { color: #a03d00; }

.status {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 3px 8px;
  border-radius: 10px;
}

.status.on { background: #d4edda; color: #155724; }
.status.off { background: #f8d7da; color: #721c24; }
</style>
