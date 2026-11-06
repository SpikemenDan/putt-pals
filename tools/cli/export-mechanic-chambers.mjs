#!/usr/bin/env node
/** Export an ordinary validated course document with development chambers appended. */
import { createCourseDocument, validateCourseDocument } from '../../src/courses/document.js';
import { createMechanicChambers } from '../../src/courses/mechanic-chambers.js';
export function createMechanicChamberDocument() {
  const document=createCourseDocument();
  for(const c of Object.values(createMechanicChambers())) {
    const {id,name,desc,tee,hole,par,penalty,limitSeconds,cup,...geometry}=c;
    document.courses.push({id,name,description:desc,index:document.courses.length,starter:false,geometry,
      putts:[{id:id+'-putt',index:0,tee,hole,par,penalty,limitSeconds,cupRadius:cup}]});
  }
  const checked=validateCourseDocument(document);
  if(!checked.valid)throw new Error(checked.errors.join('\n'));
  return document;
}
if(process.argv[1] && import.meta.url === new URL(process.argv[1],'file:').href) console.log(JSON.stringify(createMechanicChamberDocument(),null,2));
