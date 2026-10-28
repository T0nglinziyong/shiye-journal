import React from 'react';
import {CREATION_METHODS,creationMethod} from './creation-methods.js';
export function CreationModePicker({value,onChange,id='match-creation-mode'}){
 return <label>创作模式<select id={id} value={creationMethod(value)} onChange={event=>onChange(event.target.value)}>{CREATION_METHODS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>;
}
