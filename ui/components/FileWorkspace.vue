<script setup>
import { t, serviceMessage } from '../i18n.js';
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue';
import { EditorView, minimalSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
const props=defineProps({project:String,styleNonce:String,active:Boolean,api:Function});
const emit=defineEmits(['activate']);
const entries=ref([]), expanded=ref(new Set([''])), file=ref(null), dirty=ref(false), busy=ref(false), error=ref('');
const editor=ref(null);
const projectName=computed(()=>props.project.split(/[\\/]/).pop());
let view;
const cache=new Map();
const visible=computed(()=>{entries.value;const rows=[];const walk=(path,depth)=>{for(const item of cache.get(path)||[]){rows.push({...item,depth});if(item.directory&&expanded.value.has(item.path))walk(item.path,depth+1);}};if(expanded.value.has(''))walk('',0);return rows;});
const request=(action,body={})=>props.api('files/'+action,{...body,project:props.project});
async function operation(fn){if(busy.value)return;busy.value=true;error.value='';try{await fn();}catch(e){error.value=e.message;}finally{busy.value=false;}}
function canLeave(){if(busy.value)return false;return !dirty.value||window.confirm(t('当前文件尚未保存，是否放弃修改？'));}
defineExpose({canLeave});
async function loadFolder(path){cache.set(path,await request('list',{path}));entries.value=[...cache.values()];}
async function toggle(item){if(!item.directory)return openFile(item.path);await operation(async()=>{const next=new Set(expanded.value);if(next.has(item.path))next.delete(item.path);else{await loadFolder(item.path);next.add(item.path);}expanded.value=next;});}
function language(path){const ext=path.split('.').pop().toLowerCase();if(['js','mjs','cjs','jsx','ts','tsx'].includes(ext))return javascript({typescript:['ts','tsx'].includes(ext),jsx:['jsx','tsx'].includes(ext)});if(ext==='py')return python();if(['html','htm'].includes(ext))return html();if(ext==='css')return css();if(ext==='json')return json();if(ext==='md')return markdown();return [];}
async function openFile(path,line=1){if(!canLeave())return;await operation(async()=>{
  const data=await request('read',{path});emit('activate');file.value=data;dirty.value=false;
  await nextTick();view?.destroy();
  view=new EditorView({parent:editor.value,state:EditorState.create({doc:data.content,extensions:[minimalSetup,lineNumbers(),highlightActiveLine(),EditorView.cspNonce.of(props.styleNonce),language(path),keymap.of([{key:'Mod-s',run:()=>{void save();return true;}}]),EditorView.updateListener.of(update=>{if(update.docChanged)dirty.value=update.state.doc.toString()!==file.value.content.replaceAll("\r\n","\n");}),EditorView.theme({'&':{height:'100%',fontSize:'14px'},'.cm-scroller':{overflow:'auto',fontFamily:'Consolas, "Microsoft YaHei", monospace'},'.cm-content':{minHeight:'380px'}})]})});
  const position=view.state.doc.line(Math.min(line,view.state.doc.lines)).from;view.dispatch({selection:{anchor:position},effects:EditorView.scrollIntoView(position,{y:'center'})});view.focus();
});}
async function save(){await operation(async()=>{if(!file.value||!view)return;const text=view.state.doc.toString();const content=file.value.content.includes('\r\n')?text.replaceAll('\n','\r\n'):text;file.value=await request('save',{path:file.value.path,content,revision:file.value.revision});dirty.value=view.state.doc.toString()!==text;});}
async function refresh(){await operation(async()=>{for(const path of expanded.value)await loadFolder(path);});}
watch(()=>props.project,async()=>{view?.destroy();view=null;file.value=null;dirty.value=false;cache.clear();entries.value=[];expanded.value=new Set(['']);await refresh();},{immediate:true});
function unload(event){if(dirty.value){event.preventDefault();event.returnValue='';}}
window.addEventListener('beforeunload',unload);
onBeforeUnmount(()=>{view?.destroy();window.removeEventListener('beforeunload',unload);});
</script>
<template>
<div class="file-tree">
<button class="file-root" :aria-expanded="expanded.has('')" :disabled="busy" @click="toggle({path:'',directory:true})"><span>{{ expanded.has('')?'▾':'▸' }}</span>{{ projectName }}<span v-if="dirty"> ●</span></button>
<div v-if="expanded.has('')" class="tree-entries"><button v-for="entry in visible" :key="entry.path" class="tree-entry" :class="{selected:file?.path===entry.path&&active}" :style="{paddingLeft:(28+entry.depth*20)+'px'}" :aria-expanded="entry.directory ? expanded.has(entry.path) : undefined" :title="entry.path" :disabled="busy" @click="toggle(entry)"><span>{{ entry.directory?(expanded.has(entry.path)?'▾':'▸'):'·' }}</span>{{ entry.name }}</button><p v-if="!visible.length">{{ t('暂无文件') }}</p></div>
<p v-if="error" class="tree-error" role="alert">{{ serviceMessage(error) }}</p>
</div>
<Teleport to="#file-editor-host">
<section v-show="active" class="card file-workspace">
<div class="editor-heading"><div><span class="eyebrow">APPLICATION FILES</span><h2>{{ file?.path || projectName }}<small v-if="dirty">{{ t(' · 未保存') }}</small></h2></div><button class="primary" :disabled="busy||!dirty" @click="save">{{ t('保存 Ctrl / ⌘ S') }}</button></div>
<p class="subtle">{{ t('保存到本机应用目录。修改运行中的代码后，重启智能体以加载更改。') }}</p><p v-if="error" class="file-error" role="alert">{{ serviceMessage(error) }}</p>
<p v-if="!file" class="empty">{{ t('从左侧目录打开文件。支持 JS、TS、Python、HTML、CSS、JSON、Markdown 语法高亮。') }}</p><div ref="editor" class="code-editor" v-show="file"></div>
</section>
</Teleport>
</template>
<style scoped>
.file-tree{margin:0 0 12px 10px;min-width:0;color:#dcecff}.file-tree button{display:flex;width:100%;grid-template-columns:none;margin:0;border-radius:6px;padding:7px 9px;font:inherit;font-size:12px;color:inherit;background:transparent;border:0;text-align:left;box-shadow:none;gap:7px}.file-tree button:hover,.file-tree button.selected{background:#ffffff24;color:white}.file-tree .file-root{font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.tree-entries{max-height:40vh;overflow:auto}.file-tree .tree-entry{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}.tree-entry span{margin-right:7px}.tree-error{color:#ffe2d3;font-size:12px;overflow-wrap:anywhere}.file-workspace{min-width:0}.editor-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.editor-heading h2{font-size:20px;overflow-wrap:anywhere}.editor-heading small{font-size:12px;color:#b26413}.code-editor{height:65vh;min-height:380px;border:1px solid #d5e3f6;border-radius:12px;overflow:hidden;margin-top:16px;text-align:left}.file-error{color:#bd3028}
</style>