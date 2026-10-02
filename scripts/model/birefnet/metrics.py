import numpy as np, cv2
def boundary(m):
    m=m.astype(np.uint8); return (m-cv2.erode(m,np.ones((3,3),np.uint8)))>0
def bf_score(pred,gt,tol):
    bp,bg=boundary(pred>0.5),boundary(gt>0.5)
    if bg.sum()==0 or bp.sum()==0: return float(bg.sum()==bp.sum())
    dg=cv2.distanceTransform((~bg).astype(np.uint8),cv2.DIST_L2,3); dp=cv2.distanceTransform((~bp).astype(np.uint8),cv2.DIST_L2,3)
    P=(dg[bp]<=tol).mean(); R=(dp[bg]<=tol).mean(); return 0 if P+R==0 else 2*P*R/(P+R)
def band(gt,w):
    b=boundary(gt>0.5); d=cv2.distanceTransform((~b).astype(np.uint8),cv2.DIST_L2,3)
    return (d<=w)|((gt>0.02)&(gt<0.98))
def all_metrics(pred,gt):
    H,W=gt.shape; diag=(H*H+W*W)**.5; tol=max(2,0.0075*diag)
    pb,gb=pred>0.5,gt>0.5; iou=(pb&gb).sum()/max((pb|gb).sum(),1)
    bd=band(gt,max(3,int(0.006*diag)))
    return dict(mae=float(np.abs(pred-gt).mean()),iou=float(iou),bf=bf_score(pred,gt,tol),edge_mae=float(np.abs(pred-gt)[bd].mean()))
def comp_err(a,F,a_gt,F_gt,bgcol,gt):
    B=np.array(bgcol,np.float32)[None,None]; c=a[...,None]*F+(1-a[...,None])*B; cg=a_gt[...,None]*F_gt+(1-a_gt[...,None])*B
    H,W=gt.shape; bd=band(gt,max(3,int(0.006*(H*H+W*W)**.5)))
    return float(np.abs(c-cg)[bd].mean())
