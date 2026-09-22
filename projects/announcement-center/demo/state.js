(function(root){
  class NoticeState {
    constructor(){this.view='list';this.expanded=null;this.read=new Set(['guide']);}
    open(id){if(!['update','compensation','guide'].includes(id))throw new Error('Unknown notice');this.expanded=this.expanded===id?null:id;this.read.add(id);}
    backOrClose(){this.dismiss();}
    dismiss(){this.view='closed';this.expanded=null;}
    show(){this.view='list';this.expanded=null;}
  }
  if(typeof module!=='undefined')module.exports={NoticeState};else root.NoticeState=NoticeState;
})(typeof window!=='undefined'?window:globalThis);
