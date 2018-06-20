const pgp = require("pg-promise")();
const { getNewBody } = require("../helpers/utils");

const db = pgp(process.env.DATABASE_URL || "postgres://localhost:5432/busydb");

async function addUser(
  timestamp,
  name,
  metadata,
  owner,
  active,
  posting,
  memoKey
) {
  await db.none(
    "INSERT INTO accounts (created_at, name, metadata, owner, active, posting, memo_key) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
    [
      timestamp,
      name,
      JSON.stringify(metadata),
      JSON.stringify(owner),
      JSON.stringify(active),
      JSON.stringify(posting),
      memoKey
    ]
  );
}

async function addPost(timestamp, category, author, permlink, title, body) {
  const oldPost = await db.oneOrNone(
    "SELECT title, body FROM posts WHERE author=$1 AND permlink=$2",
    [author, permlink]
  );

  if (!oldPost) {
    await db.none(
      "INSERT INTO posts (created_at, updated_at, category, author, permlink, title, body) VALUES ($1, $1, $2, $3, $4, $5, $6)",
      [timestamp, category, author, permlink, title, body]
    );

    return;
  }

  if (oldPost) {
    const newBody = getNewBody(oldPost.body, body);

    if (oldPost.title === title && oldPost.body === newBody) return;

    await db.none(
      "UPDATE posts SET updated_at=$1, title=$2, body=$3 WHERE author=$4 AND permlink=$5",
      [timestamp, title, newBody, author, permlink]
    );
  }
}

async function addComment(
  timestamp,
  parentAuthor,
  parentPermlink,
  author,
  permlink,
  body
) {
  const oldComment = await db.oneOrNone(
    "SELECT body FROM comments WHERE author=$1 AND permlink=$2",
    [author, permlink]
  );

  if (!oldComment) {
    await db.none(
      "INSERT INTO comments (created_at, updated_at, parent_author, parent_permlink, author, permlink, body) VALUES ($1, $1, $2, $3, $4, $5, $6)",
      [timestamp, parentAuthor, parentPermlink, author, permlink, body]
    );

    return;
  }

  if (oldComment) {
    const newBody = getNewBody(oldComment.body, body);

    if (oldComment.body === newBody) return;

    await db.none(
      "UPDATE comments SET updated_at=$1, body=$2 WHERE author=$3 AND permlink=$4",
      [timestamp, newBody, author, permlink]
    );
  }
}

async function deletePost(timestamp, author, permlink) {
  await db.none("DELETE FROM posts WHERE author=$1 and permlink=$2", [
    author,
    permlink
  ]);
}

async function addVote(timestamp, voter, author, permlink, weight) {
  await db.none(
    "INSERT INTO votes(created_at, updated_at, post_author, post_permlink, voter, weight) VALUES ($1, $1, $2, $3, $4, $5) ON CONFLICT ON CONSTRAINT uc_vote DO UPDATE SET weight=$5",
    [timestamp, author, permlink, voter, weight]
  );
}

async function addFollow(timestamp, follower, followed, what) {
  await db.none(
    "INSERT INTO follows (created_at, updated_at, follower, followed, what) VALUES ($1, $1, $2, $3, $4) ON CONFLICT DO NOTHING",
    [timestamp, follower, followed, JSON.stringify(what)]
  );
}

async function removeFollow(timestamp, follower, followed) {
  await db.none("DELETE FROM follows WHERE follower=$1 and followed=$2", [
    follower,
    followed
  ]);
}

async function addReblog(timestamp, account, author, permlink) {
  await db.none(
    "INSERT INTO reblogs (created_at, account, author, permlink) VALUES ($1, $2, $3, $4)",
    [timestamp, account, author, permlink]
  );
}

async function addProducerReward(timestamp, producer, vestingShares) {
  await db.none(
    "INSERT INTO producer_rewards (created_at, producer, vesting_shares) VALUES ($1, $2, $3)",
    [timestamp, producer, parseFloat(vestingShares)]
  );
  await db.none(
    "UPDATE accounts SET vesting_shares = vesting_shares + $1 WHERE name=$2",
    [parseFloat(vestingShares), producer]
  );
}

async function addAuthorReward(
  timestamp,
  author,
  permlink,
  sbdPayout,
  steemPayout,
  vestingPayout
) {
  await db.none(
    "INSERT INTO author_rewards (created_at, author, permlink, sbd_payout, steem_payout, vesting_payout) VALUES ($1, $2, $3, $4, $5, $6)",
    [
      timestamp,
      author,
      permlink,
      parseFloat(sbdPayout),
      parseFloat(steemPayout),
      parseFloat(vestingPayout)
    ]
  );
  await db.none(
    "UPDATE accounts SET balance = balance + $1, sbd_balance = sbd_balance + $2, vesting_shares = vesting_shares + $3 WHERE name=$4",
    [
      parseFloat(steemPayout),
      parseFloat(sbdPayout),
      parseFloat(vestingPayout),
      author
    ]
  );
}

async function addCurationReward(
  timestamp,
  curator,
  reward,
  commentAuthor,
  commentPermlink
) {
  await db.none(
    "INSERT INTO curation_rewards (created_at, curator, reward, comment_author, comment_permlink) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING",
    [timestamp, curator, parseFloat(reward), commentAuthor, commentPermlink]
  );
  await db.none(
    "UPDATE accounts SET vesting_shares = vesting_shares + $1 WHERE name=$2",
    [parseFloat(reward), curator]
  );
}

async function addTransfer(timestamp, from, to, amount, memo) {
  const asset = amount.split(" ")[1];
  await db.none(
    "INSERT INTO transfers (created_at, transfer_from, transfer_to, amount, asset, memo) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
    [timestamp, from, to, parseFloat(amount), asset, memo]
  );
  const steemAmount = asset === "STEEM" ? parseFloat(amount) : 0;
  const sbdAmount = asset === "SBD" ? parseFloat(amount) : 0;
  await db.none(
    "UPDATE accounts SET balance = balance - $1, sbd_balance = sbd_balance - $2 WHERE name=$3",
    [steemAmount, sbdAmount, from]
  );
  await db.none(
    "UPDATE accounts SET balance = balance + $1, sbd_balance = sbd_balance + $2 WHERE name=$3",
    [steemAmount, sbdAmount, to]
  );
}

async function addClaimRewardBalance(
  account,
  rewardSteem,
  rewardSbd,
  rewardVests
) {
  await db.none(
    "UPDATE accounts SET balance = balance + $1, sbd_balance = sbd_balance + $2, vesting_shares = vesting_shares + $3 WHERE name=$4",
    [
      parseFloat(rewardSteem),
      parseFloat(rewardSbd),
      parseFloat(rewardVests),
      account
    ]
  );
}

async function addDelegateVestingShares(delegator, delegatee, vestingShares) {
  await db.none(
    "UPDATE accounts SET delegated_vesting_shares = delegated_vesting_shares + $1 WHERE name=$2",
    [parseFloat(vestingShares), delegator]
  );
  await db.none(
    "UPDATE accounts SET received_vesting_shares = received_vesting_shares + $1 WHERE name=$2",
    [parseFloat(vestingShares), delegatee]
  );
}

async function handleReturnVestingDelegation(account, vestingShares) {
  await db.none(
    "UPDATE accounts SET delegated_vesting_shares = delegated_vesting_shares - $1 WHERE name=$2",
    [parseFloat(vestingShares), account]
  );
}

async function addTransferToVesting(from, to, amount) {
  await db.none("UPDATE accounts SET balance = balance - $1 WHERE name=$2", [
    parseFloat(amount),
    to || from
  ]);
  /* TODO: calculate VEST amount from STEEM and increment account vesting_shares */
}

module.exports = {
  addUser,
  addPost,
  addComment,
  deletePost,
  addVote,
  addFollow,
  removeFollow,
  addReblog,
  addProducerReward,
  addAuthorReward,
  addCurationReward,
  addTransfer,
  addClaimRewardBalance,
  addDelegateVestingShares,
  handleReturnVestingDelegation,
  addTransferToVesting
};
