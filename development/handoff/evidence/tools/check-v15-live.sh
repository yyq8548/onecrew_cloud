set -u
batch_data=${1:?请提供保存真实材料的数据目录}
batch_output=${2:?请提供新的结果目录}
mkdir "$batch_output" || exit 1
export ONECREW_MODEL_RUNTIME=macos-metal
export ONECREW_MODEL_SIZE=4b
batch_failed=0
score_sample() {
  batch_name=$1
  shift
  if node development/cloud/model/check-score.mjs "$batch_data" "$@" > "$batch_output/$batch_name.log" 2>&1
  then
    printf '%s passed\n' "$batch_name"
  else
    printf '%s failed\n' "$batch_name"
    batch_failed=1
  fi
}
score_sample water score-samples-fb17e7bd-d9da-4e09-af41-2bbc5ba9014a 03cb8953-8898-47e7-9905-277c7f7055a1 'Insulated stainless steel water bottle' 'Reusable insulated bottle for carrying water on hikes and daily commutes.' '' 1 1000000 '' supported 'water bottles?|travel mugs?|insulat|leak|Owala.*(?:test|bottles?)' supported
score_sample bottlepro score-samples-fb17e7bd-d9da-4e09-af41-2bbc5ba9014a a5534c35-8de1-4044-90b5-3e6cc6733482 'Insulated stainless steel water bottle' 'Reusable insulated bottle for carrying water on hikes and daily commutes.' '' 10000 100000 '' supported 'bottles?|insulat|durability|cleaning' supported
score_sample ad score-samples-fb17e7bd-d9da-4e09-af41-2bbc5ba9014a 03cb8953-8898-47e7-9905-277c7f7055a1 'Laundry Sauce' 'Laundry detergent for washing clothes.' '' 1 1000000 '' insufficient 'Laundry Sauce|laundry|PRUDENTREVIEWS15' insufficient
score_sample sunscreen cloud-live-search e778457d-6398-4123-98c9-dad8e7e3e5a6 'Daily sunscreen SPF 50' 'Sunscreen for daily sun protection.' '' 1 1000000 '' supported 'sunscreen|spf|sun|skin|cleanser' supported
score_sample unrelated cloud-live-search e778457d-6398-4123-98c9-dad8e7e3e5a6 'Industrial floor drill press' 'Heavy industrial drill press for machining metal in a factory.' '' 1 1000000 '' insufficient '' insufficient
score_sample followers cloud-live-search e778457d-6398-4123-98c9-dad8e7e3e5a6 'Daily sunscreen SPF 50' 'Sunscreen for daily sun protection.' '' 10000 100000
exit "$batch_failed"
