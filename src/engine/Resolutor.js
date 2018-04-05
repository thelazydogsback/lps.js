const Clause = require('./Clause');
const Functor = require('./Functor');
const Unifier = require('./Unifier');
const Variable = require('./Variable');
const variableArrayRename = require('../utility/variableArrayRename');

function Resolutor() {

}

let recursiveQueryRequest = function recursiveQueryRequest(program, queryArg, recursiveQuery, actions) {
  const BuiltInFunctorProvider = require('./BuiltInFunctorProvider');
  let builtInFunctors = new BuiltInFunctorProvider(program);
  if (builtInFunctors.has(queryArg.getId())) {
    let result = builtInFunctors.execute(queryArg.getId(), queryArg.getArguments());
    if (result) {
      return [];
    }
    return null;
  }

  if (actions.indexOf(queryArg.getId()) > -1) {
    let actionArgs = queryArg.getArguments();
    let theta = {};
    return [{
      theta: theta,
      actions: [
        new Functor(queryArg.getName(), actionArgs)
      ]
    }];
  }

  let programWithoutClause = [];
  for (let i = 0; i < program.length; i += 1) {
    let clause = program[i];
    programWithoutClause.push(program.filter(c => c !== clause));
  }
  let result = [];
  for (let i = 0; i < program.length; i += 1) {
    let clause = program[i];

    let queryResult = recursiveQuery(programWithoutClause[i], clause, queryArg);
    if (queryResult === null && clause.isConstraint()) {
      return null;
    }
    if (queryResult !== null) {
      result = result.concat(queryResult);
    }
  }
  return result;
};

let createRecursiveQuery = function createRecursiveQuery(program, actions) {
  // console.log('--');
  // program.forEach((c) => console.log(c.toString()));
  // console.log('--');
  return (programWithoutClause, clause, queryArg) => {
    if (clause.isFact()) { // we check the head literals for match
      let resolution = Resolutor.resolveAction(clause, queryArg);
      if (resolution === null) {
        return [];
      }
      return [{ theta: resolution.theta, actions: [] }];
    }

    let resolution = Resolutor.resolve(clause, queryArg);
    if (resolution === null) {
      return [];
    }

    if (clause.isConstraint()) {
      let bodyLiterals = resolution.clause.getBodyLiterals();
      // program without the clause itself must be used to ensure termination
      let constraintQueryResult = Resolutor.query(programWithoutClause, bodyLiterals, actions);
      if (constraintQueryResult === null) {
        return [];
      }
      return null;
    }

    if (!resolution.clause.isFact()) {
      let bodyLiterals = resolution.clause.getBodyLiterals();
      // we need a program without the current clause otherwise we'll
      // end up in an infinite loop.
      if (Resolutor.query(programWithoutClause, bodyLiterals, actions) === null) {
        return null;
      }
    }

    let headLiteralSet = resolution.clause.getHeadLiterals();
    let result = Resolutor.query(program, headLiteralSet, actions);
    result = result.map((entryArg) => {
      let entry = entryArg;
      entry.theta = Resolutor.compactTheta(resolution.theta, entry.theta);
      return entry;
    });

    return result;
  };
};


let createRecursiveReverseQuery = function createRecursiveReverseQuery(program, actions) {
  return (programWithoutClause, clause, queryArg) => {
  };
};

Resolutor.compactTheta = function compactTheta(theta1, theta2) {
  let theta = {};
  Object.keys(theta1).forEach((key) => {
    let substitution = theta1[key];
    while (substitution instanceof Variable && theta2[substitution.evaluate()]) {
      substitution = theta2[substitution.evaluate()];
    }
    theta[key] = substitution;
  });
  Object.keys(theta2).forEach((key) => {
    let substitution = theta2[key];
    theta[key] = substitution;
  });
  return theta;
};

Resolutor.query = function query(program, queryLiteralSet, actionsArg) {
  let actions = actionsArg;
  if (actions === undefined) {
    actions = [];
  }

  if (queryLiteralSet instanceof Array) {
    let result = [];
    let queryResult = Resolutor.query(program, queryLiteralSet[0], actions);
    if (queryResult === null) {
      return null;
    }
    result = result.concat(queryResult);

    for (let i = 1; i < queryLiteralSet.length; i += 1) {
      let literal = queryLiteralSet[i];
      let newResult = [];
      for (let j = 0; j < result.length; ++j) {
        let entry = result[j];
        let substitutedLiteral = literal.substitute(entry.theta);

        queryResult = Resolutor.query(program, substitutedLiteral, actions);
        if (queryResult === null) {
          return null;
        }

        queryResult.forEach((q) => {
          let rtheta = entry.theta;
          rtheta = Resolutor.compactTheta(entry.theta, q.theta);
          newResult.push({
            theta: rtheta,
            actions: entry.actions.concat(q.actions)
          });
        });
      }
      result = newResult;
    }
    return result;
  }

  return recursiveQueryRequest(program, queryLiteralSet, createRecursiveQuery(program, actions),  actions);
};

Resolutor.reverseQuery = function query(program, clause, head, actions) {
  if (actions !== undefined && actions.indexOf(head.getId()) > -1) {
    return [{
      theta: {},
      actions: [
        new Functor(head.getName(), head.getArguments())
      ]
    }];
  }
  if (clause === null) {
    let result = [];
    for (let i = 0; i < program.length; i += 1) {
      let programClause = program[i];
      let queryResult = Resolutor.reverseQuery(program, programClause, head, actions);
      if (queryResult !== null) {
        result = result.concat(queryResult);
      }
    }
    return result;
  }

  if (clause.isFact() || clause.isConstraint()) {
    // not interested in facts or queries
    return null;
  }

  let resolution = Resolutor.resolveAction(clause, head);
  if (resolution === null) {
    return null;
  }
  if (resolution.clause.getHeadLiteralsCount() > 0) {
    return null;
  }

  let bodyLiterals = resolution.clause.getBodyLiterals();

  // we need a program without the current clause otherwise we'll
  // end up in an infinite loop.
  let programP = program.filter(c => c !== clause);
  let result = [];
  for (let i = 0; i < bodyLiterals.length; i += 1) {
    let queryHead = bodyLiterals[i];
    let queryResult = Resolutor.reverseQuery(programP, null, queryHead, actions);
    if (queryResult === null) {
      return null;
    }
    queryResult = queryResult.map((rArg) => {
      let r = rArg;
      r.theta = Resolutor.compactTheta(resolution.theta, r.theta);
      return r;
    });
    result = result.concat(queryResult);
  }
  return result;
};

Resolutor.resolve = function resolve(clause, fact, thetaArg) {
  let factVariableRenaming = variableArrayRename(fact.getVariables(), '$fv_*');
  let substitutedFact = fact
    .substitute(factVariableRenaming);
  let theta = thetaArg;
  if (theta === undefined) {
    theta = {};
  }
  let unresolvedBodyLiterals = [];
  let _head = clause.getHeadLiterals();
  let _body = clause.getBodyLiterals();

  // ensure to only resolve first matching literal
  // because we're processing left to right
  for (let i = 0; i < _body.length; i += 1) {
    let literal = _body[i];
    let newTheta = Unifier.unifies([[substitutedFact, literal]], theta);
    if (newTheta === null) {
      // unable to unify, let's just add to unresolvedBodyLiterals
      unresolvedBodyLiterals.push(literal);
    } else {
      theta = newTheta;
      // add remaining body literals
      for (let j = i + 1; j < _body.length; j += 1) {
        literal = _body[j];
        unresolvedBodyLiterals.push(literal);
      }
      break;
    }
  }

  if (unresolvedBodyLiterals.length === _body.length) {
    // nothing got resolved, probably not a matching rule.
    return null;
  }

  // perform substitution here
  unresolvedBodyLiterals = unresolvedBodyLiterals.map((literal) => {
    return literal.substitute(theta);
  });

  // perform head check
  let newHead = _head.map(expressions => expressions.substitute(theta));
  theta = Resolutor.compactTheta(factVariableRenaming, theta);
  return {
    clause: new Clause(newHead, unresolvedBodyLiterals),
    theta: theta
  };
};

Resolutor.resolveAction = function resolveAction(clause, action, thetaArg) {
  let actionVariableRenaming = variableArrayRename(action.getVariables(), '$fv_*');
  let substitutedAction = action
    .substitute(actionVariableRenaming);
  let theta = thetaArg;
  if (theta === undefined) {
    theta = {};
  }
  let unresolvedHeadLiterals = [];
  let _head = clause.getHeadLiterals();
  let _body = clause.getBodyLiterals();

  _head.forEach((literal) => {
    let newTheta = Unifier.unifies([[substitutedAction, literal]], theta);
    if (newTheta === null) {
      // unable to unify, let's just add to unresolvedBodyLiterals
      unresolvedHeadLiterals.push(literal);
    } else {
      theta = newTheta;
    }
  });

  if (unresolvedHeadLiterals.length === _head.length) {
    // nothing got resolved, probably not a matching rule.
    return null;
  }

  // perform substitution here
  unresolvedHeadLiterals = unresolvedHeadLiterals.map((literal) => {
    return literal.substitute(theta);
  });

  // perform head check
  let newBody = _body.map(expressions => expressions.substitute(theta));
  theta = Resolutor.compactTheta(actionVariableRenaming, theta);
  return {
    clause: new Clause(unresolvedHeadLiterals, newBody),
    theta: theta
  };
};

module.exports = Resolutor;
