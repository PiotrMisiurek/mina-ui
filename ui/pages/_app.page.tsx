import '../styles/globals.css';
import { useEffect, useState } from 'react';

import './reactCOIServiceWorker';

import ZkappWorkerClient from './zkappWorkerClient';

import {
  PublicKey,
  PrivateKey,
  Field,
} from 'snarkyjs';

let transactionFee = 0.1;

export default function App() {

  let [state, setState] = useState({
    zkappWorkerClient: null as null | ZkappWorkerClient,
    hasWallet: null as null | boolean,
    hasBeenSetup: false,
    accountExists: false,
    currentNum: null as null | Field,
    publicKey: null as null | PublicKey,
    zkappPublicKey: null as null | PublicKey,
    creatingTransaction: false,
  }); 

  useEffect(() => {
    (async () => {
      if (!state.hasBeenSetup) {
        const zkappWorkerClient = new ZkappWorkerClient();

        console.log('getting snarky...');
        await zkappWorkerClient.loadSnarkyJS();
        console.log('snarky as fuck');

        await zkappWorkerClient.setActiveInstanceToBerkeley();

        const mina = (window as any).mina;

        if (mina == null) {
          setState({ ...state, hasWallet: false });
          return;
        }

        const publicKeyBase58 : string = (await mina.requestAccounts())[0];
        const publicKey = PublicKey.fromBase58(publicKeyBase58);

        console.log('using key: ' + publicKey.toBase58());

        console.log('checking account existance...');
        const res = await zkappWorkerClient.fetchAccount({ publicKey: publicKey });
        const accountExists = res.error == null;

        await zkappWorkerClient.loadContract();

        console.log('compiling contracts...');
        await zkappWorkerClient.compileContract();
        console.log('contracts compiled.');

        const zaappPublicKeyBase58 = 'B62qqYLXmWtC4DmJkdwoa512ztT2BdB5id7YA3VVY6jKDvu6e8XkWux';
        const zkappPublicKey = PublicKey.fromBase58(zaappPublicKeyBase58);

        await zkappWorkerClient.initZkappInstance(zkappPublicKey);

        console.log('loading state...');
        await zkappWorkerClient.fetchAccount( {publicKey: zkappPublicKey} );
        const currentNum = await zkappWorkerClient.getNum();
        console.log('current statw: ' + currentNum.toString());

        setState({
          ...state,
          zkappWorkerClient,
          hasWallet: true,
          hasBeenSetup: true,
          publicKey,
          zkappPublicKey,
          accountExists,
          currentNum
        });
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (state.hasBeenSetup && !state.accountExists) {
        for (;;) {
          console.log('checking account existance...');
          const res = await state.zkappWorkerClient!.fetchAccount({ publicKey: state.publicKey! });
          const accountExists = res.error == null;
          if (accountExists) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        setState({ ...state, accountExists: true });
      }
    })
  }, [state.hasBeenSetup]);

  const onSendTransaction = async () => {
    setState({ ...state, creatingTransaction: true });
    console.log('sending transaction....');

    await state.zkappWorkerClient!.fetchAccount({ publicKey: state.publicKey! });
    await state.zkappWorkerClient!.createUpdateTransaction();

    console.log('Proof, proof...');
    await state.zkappWorkerClient!.proveUpdateTransaction();

    console.log('Getting JSON home...');
    const txJSON = await state.zkappWorkerClient!.getTransactionJSON();

    console.log('sending tx home');
    const { txHash } = await (window as any).mina.sendTransaction({
      transaction: txJSON,
      feePayer: {
        fee: transactionFee,
        memo: '',
      },
    });

    console.log('transaction preview: https://berkeley.minaexplorer.com/transaction/' + txHash);

    setState({ ...state, creatingTransaction: false });
  }

  const onRefreshCurrentNum = async () => {
    console.log('getting zkApp state...');
    await state.zkappWorkerClient!.fetchAccount({ publicKey: state.zkappPublicKey! });
    const currentNum = await state.zkappWorkerClient!.getNum();
    console.log('current num: ' + currentNum);

    setState({ ...state, currentNum});
  }

  let hasWallet;
  if (state.hasWallet != null && !state.hasWallet) { 
    const noWallet = '<div>wallet not found</div>';
  }

  let setupText = state.hasBeenSetup ? 'SnarkyJS ready' : 'SnarkyJS getting ready...';
  let setup = <div> { setupText } { hasWallet }</div>;

  let accountDoesNotExist;
  if (state.hasBeenSetup && !state.accountExists) {
    const faucetLink = 'https://faucet.minaprotocol.com/?address='+ state.publicKey!.toBase58();
    accountDoesNotExist = <div>
      Account does not exist. Please visit the faucet to fund this account
      <a href={faucetLink} target="_blank" rel="noreferrer"> [Link] </a>
    </div>
  }

  let mainContent;
  if (state.hasBeenSetup && state.accountExists) {
    mainContent = <div>
      <button onClick={ onSendTransaction } disabled={ state.creatingTransaction }>Send Transaction</button>
      <div>Current Number in zkAPP: { state.currentNum!.toString() }</div>
      <button onClick={ onRefreshCurrentNum }>Fetch state</button>
    </div>
  }

  return <div>
    { setup }
    { accountDoesNotExist }
    { mainContent }
  </div>;
}