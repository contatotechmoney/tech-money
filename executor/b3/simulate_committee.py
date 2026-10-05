"""Offline committee exercise: fabricated data/usage/prices, no network or wallet bridge."""
from dataclasses import replace
from budget import BudgetError, Ledger, Limits
from request_plan import prepare_request
from response_contract import reconcile_response

AGENTS = ('carlos','helena','marcos','fernanda','rodrigo','juliana','andre','marina','otavio')
POLICY = Limits('nous','synthetic-deepseek-test','synthetic-only',1_000_000,2_000_000,1000,1000,21,3,100,100,900)


def run_simulation(db_path, scenario='success'):
    if scenario not in ('success','unknown_usage','truncated','budget_exhausted'):
        raise ValueError('Unknown simulation scenario')
    ledger = Ledger(db_path, clock=lambda:1000)
    policy = replace(POLICY,max_cost_micro_usd=150) if scenario=='budget_exhausted' else POLICY
    ledger.create_job('simulation',policy)
    stages = [(f'round{r}-{a}',a,f'round{r}') for r in (1,2) for a in AGENTS]
    stages += [(f'refutation-{i}','reviewers','refutation') for i in (1,2)] + [('moderator','rafael','synthesis')]
    results, outcome = [], 'simulated_complete'
    for call,agent,phase in stages:
        try:
            prepare_request(ledger,'simulation',call,agent,phase,[{'role':'user','content':f'Synthetic fixture for {phase}, {agent}. No investment conclusion.'}],50,50)
        except BudgetError as error:
            outcome = str(error)
            break
        if not ledger.claim_dispatch('simulation',call):
            raise RuntimeError('Simulation must never resend a claimed call')
        body = {'model':policy.model,'usage':{'prompt_tokens':20,'completion_tokens':10,'total_tokens':30},'choices':[{'finish_reason':'stop','message':{'content':f'SIMULATED response: {agent}, {phase}'}}]}
        if scenario=='unknown_usage': body['usage']=None
        if scenario=='truncated': body['choices'][0]['finish_reason']='length'
        try: result = reconcile_response(ledger,'simulation',call,body)
        except BudgetError as error:
            outcome = str(error)
            break
        results.append({'agent':agent,'phase':phase,'complete':result['complete']})
        if not result['complete']:
            outcome='incomplete_response'
            break
    snapshot = ledger.snapshot('simulation')
    return {'simulation':True,'live_enabled':False,'prices':'synthetic','network_calls':0,'portal_wallet_connected':False,'outcome':outcome,'settled_responses':len(results),'prepared_calls':len(snapshot['calls']),'held_tokens':snapshot['held_tokens'],'held_cost_micro_usd':snapshot['held_cost_micro_usd'],'ledger_status':snapshot['status'],'results':results}
