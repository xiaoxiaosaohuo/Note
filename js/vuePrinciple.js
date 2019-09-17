function swap(arr, i, j) {
  var temp = arr[i];
  arr[i] = arr[j];
  arr[j] = temp;
}
function partion(arr,left,right){
    let pivot = left;
    let index = pivot+1;
    for(let i = index;i<=right;i++){
        if(arr[i]<arr[pivot]){
            swap(arr,i,index);
            index++
        }
    }
    swap(arr, pivot, index - 1);
    return index-1;
}
function quickSort(arr,left,right){
    let len = arr.length;
    let partionIndex;
    left = typeof left !== 'number' ? 0 : left;
    right = typeof right !== "number" ? len - 1 : right;
    if(left<=right){
         // partition的返回值作为partitionIndex来分隔数组；
        // 索引partitionIndex左边的元素均小于arr[partitionIndex]；
        // 右边的元素均大于arr[partitionIndex]；
        partionIndex = partion(arr,left,right);
        quickSort(arr, left, partionIndex - 1);
        quickSort(arr, partionIndex + 1, right);
    }
    return arr;
}
let a = [2,1,4,8,0,9];

let aa = quickSort(a,0,5)
console.log(aa)
