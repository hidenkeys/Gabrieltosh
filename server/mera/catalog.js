import { fail } from "./domain.js";
export async function bindProductCategory(c,s,product) {
 if(!product.categoryId)return {...product,categoryId:null,categoryPath:[]};
 const path=[],seen=new Set();let id=product.categoryId;
 while(id){
  if(seen.has(id)||path.length>=6)throw fail("Category hierarchy needs review.",409);
  seen.add(id);
  const node=(await c.query("SELECT data FROM mera_records WHERE id=$1 AND organization_id=$2 AND branch_id=$3 AND kind='category'",[id,s.organizationId,s.branchId])).rows[0]?.data;
  if(!node?.active)throw fail("Select an active category from this branch.",409);
  path.unshift({id:node.id,name:node.name,parentId:node.parentId,sortOrder:node.sortOrder});id=node.parentId;
 }
 return {...product,category:path.at(-1).name,parentCategory:path.length>1?path.at(-2).name:null,categoryPath:path};
}
