export function phoneHref(value){return typeof value==='string'&&/^(?:100|145|180|185|\+225\d{10})$/.test(value)?'tel:'+value:null;}
export function mapLinks(r){
 const precise=typeof r.lat==='number'&&typeof r.lon==='number'&&r.lat>=4&&r.lat<=11.5&&r.lon>=-9&&r.lon<=-2;
 const query=precise?`${r.lat},${r.lon}`:[r.name,r.address,r.city,'Côte d’Ivoire'].filter(Boolean).join(', ');
 return {precise,map:precise?`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=17/${r.lat}/${r.lon}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,directions:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`};
}
