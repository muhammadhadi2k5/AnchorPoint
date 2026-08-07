export const LIVE_METRICS = [
  {
    key: 'faithfulness',
    label: 'Faithfulness',
    shortLabel: 'F',
    description:
      "Does the answer stick to what the retrieved documents actually say, without adding anything made up?",
    tab: 'live',
    scoreField: 'faithfulness_score',
    reasoningField: 'faithfulness_reasoning',
    nullable: true,
    nullReason: 'no context was retrieved',
  },
  {
    key: 'answer_relevance',
    label: 'Answer relevance',
    shortLabel: 'A',
    description:
      "Does the answer actually address what was asked, regardless of whether it's factually correct?",
    tab: 'live',
    scoreField: 'answer_relevance_score',
    reasoningField: 'answer_relevance_reasoning',
    nullable: false,
    nullReason: null,
  },
  {
    key: 'context_relevance',
    label: 'Context relevance',
    shortLabel: 'C',
    description: 'Were the document chunks that got retrieved actually useful for answering this question?',
    tab: 'live',
    scoreField: 'context_relevance_score',
    reasoningField: 'context_relevance_reasoning',
    nullable: true,
    nullReason: 'no context was retrieved',
  },
]

// same entry shape as LIVE_METRICS, read by GoldenRunDetail.jsx
export const TESTSET_METRICS = [
  {
    key: 'answer_correctness',
    label: 'Correctness',
    shortLabel: 'Correctness',
    description: 'Does the generated answer convey the same information as the reference answer?',
    tab: 'testset',
    scoreField: 'answer_correctness_score',
    reasoningField: 'answer_correctness_reasoning',
    nullable: false,
    nullReason: null,
  },
  {
    key: 'context_recall',
    label: 'Context recall',
    shortLabel: 'Context recall',
    description: 'Were the expected source file(s) actually among the retrieved chunks?',
    tab: 'testset',
    scoreField: 'context_recall_score',
    reasoningField: 'context_recall_reasoning',
    nullable: true,
    nullReason: 'no expected source files were specified for this question',
  },
]
