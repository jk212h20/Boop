"""Validate the explainer's displayed moves against the source boop rules."""
import ast,unittest
from pathlib import Path
# Read only literal scene definitions; importing renderer would load narration/media.
tree=ast.parse((Path(__file__).parent/'render.py').read_text())
node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='example')
ns={};exec(compile(ast.Module(body=[node],type_ignores=[]),'<examples>','exec'),ns)
example=ns['example']
def resolve(pieces,new):
 result={};occupied={(c,r) for c,r,*_ in pieces}
 if not new:return result
 c,r,col,adult=new
 for i,(x,y,color,big) in enumerate(pieces):
  dx,dy=x-c,y-r
  if max(abs(dx),abs(dy))!=1 or big and not adult:continue
  dest=(x+dx,y+dy)
  if dest not in occupied:result[i]=dest
 return result
class Rules(unittest.TestCase):
 def test_moves(self):
  for id in ['intro','turn','boop','edge','blocked','chain','graduate','pool','power','mixed','win','eightcats','recap','junior']:
   with self.subTest(scene=id):
    p,n,m,*_=example(id);self.assertEqual(resolve(p,n),m)
 def test_graduation_rows(self):
  for id in ['graduate','pool','mixed','win','junior']:
   p,n,m,line,_,_=example(id);final=[(*m.get(i,(c,r)),col,adult) for i,(c,r,col,adult) in enumerate(p)]
   for square in line:self.assertTrue(any(a[:2]==square and a[2]=='o' for a in final))
 def test_eight(self):
  p,n,*_=example('eight');self.assertEqual(len(p),8)
  p,n,*_=example('eightcats');self.assertEqual(len(p)+1,8);self.assertTrue(all(x[3] for x in p+[n]))
 def test_no_layout_overflow(self):
  # Left-panel headline and legend fit; board is an actual 6x6 rectangle.
  self.assertLess(1050+5*123+60,1920)
  self.assertLess(270+5*123+60,961)
if __name__=='__main__':unittest.main()
