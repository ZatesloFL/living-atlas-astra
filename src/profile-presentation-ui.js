import {presentationWords} from './profile-presentation.js';
import {esc} from './block-renderer.js';
export function openPresentation(ui,profiles,apply){
 ui.open('profile-presentation','Your profile','How people see you');
 const profile=profiles?.active();
 ui.content.innerHTML=profile?`<p>${esc(presentationWords(profile))}</p><form id="presentation-form"><label>Change it in words<input name="words" required maxlength="160" placeholder="Use the name Fern"></label><button>Change how I appear</button></form><p>Try “show my name”, “show no name”, or “use the name …”. Existing published authorship stays as recorded.</p><p id="presentation-message" role="status"></p>`:'<p>Finish your local profile first.</p>';
 ui.content.querySelector('form')?.addEventListener('submit',async e=>{e.preventDefault();try{await profiles.changePresentation(e.currentTarget.elements.words.value);await apply?.();openPresentation(ui,profiles,apply);ui.content.querySelector('#presentation-message').textContent='Changed and recorded.';}catch(error){ui.content.querySelector('#presentation-message').textContent=error.message;}});
}
