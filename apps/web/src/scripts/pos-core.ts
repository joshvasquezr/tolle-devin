// D§4.4 reading position (quiet.pos.v1) and SPEC R6 landing redirect.
export const POS_KEY = "quiet.pos.v1";

/** Inline script on `/`: go to the stored PD chapter before paint. Path shape is checked, not trusted. */
export const LANDING_SCRIPT =
  `(function(){try{var p=JSON.parse(localStorage.getItem("${POS_KEY}")||"null");` +
  `if(p&&/^(bsb|kjv|web)$/.test(p.tr)&&/^[a-z0-9-]+$/.test(p.book)&&/^[0-9]{1,3}$/.test(String(p.chapter)))` +
  `location.replace("/"+p.tr+"/"+p.book+"/"+p.chapter)}catch(e){}})()`;
