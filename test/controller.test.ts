import { expect } from 'chai'
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { describe, before } from 'mocha'
import { evm, contracts } from './test-utils'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { Swaplace, MockERC20, MockERC721 } from '../typechain-types'
import { abi as abiERC20 } from '../artifacts/contracts/mock/MockERC20.sol/MockERC20.json'
import { abi as abiERC721 } from '../artifacts/contracts/mock/MockERC721.sol/MockERC721.json'
import { moveMessagePortToContext } from 'worker_threads'
import { create } from 'domain'
const deploy = contracts.deploy

describe('Swaplace', async function () {
  interface ERC20Asset {
    addr: any
    amountOrId: any
  }
  interface ERC721Asset {
    addr: any
    amountOrId: number
  }
  interface ERC721Options {
    addr: any
    amountOrId: number
  }
  type ERCTypes = 'erc20' | 'erc721' | 'erc721Options'
  interface Assets {
    erc20: ERC20Asset[]
    erc721: ERC721Asset[]
    erc721Options: ERC721Options[]
  }
  interface Trade {
    tradeIdRef: number
    proposer: any
    timestamp: number
    withdrawAddress: number
    allowedAddresses: any[]
    hashproof: any
    assetsToSend: Assets
    assetsToReceive: Assets
  }

  interface MockList {
    contractAddress: string
    contractName: string
  }
  let mockList: MockList[] = []

  let deployer: SignerWithAddress
  let userA: SignerWithAddress
  let userB: SignerWithAddress
  let receiverA: SignerWithAddress
  let receiverB: SignerWithAddress

  let swaplace: any
  let connectUserA: any
  let connectUserB: any

  let tradeCount = 1
  const DAYS = 24 * 60 * 60 // 86,400

  before(async () => {
    deployer = await beAddress('0xa152F8bb749c55E9943A3a0A3111D18ee2B3f94E')
    userA = await beAddress('0x9Bc254355E7b8E3c1D5c0518e04d041A7236aCCf')
    userB = await beAddress('0x07B664C8aF37EdDAa7e3b6030ed1F494975e9DFB')
    receiverA = await beAddress('0x0BB0636129782924eEb38E9a3Cdaa432Df3786ec')
    receiverB = await beAddress('0x187E3534f461d7C59a7d6899a983A5305b48f93F')

    swaplace = await deploy('Swaplace', deployer)
    connectUserA = await swaplace.connect(userA)
    connectUserB = await swaplace.connect(userB)
    console.log('userA: ', userA.address)
    console.log('userB: ', userB.address)
    console.log('swaplace: ', swaplace.address)
  })

  // This function is used to impersonate an address
  // and return the signer of that address
  // @param address - The address to be impersonated
  async function beAddress(address: any): Promise<SignerWithAddress> {
    const signer = await ethers.getImpersonatedSigner(address)
    expect(signer.address).to.be.equal(address)
    return signer
  }

  // This function is used to get a random number
  // between a min and max number
  // @param min - The minimum number
  async function getRandomArbitrary(min: number, max: number): Promise<number> {
    return Math.floor(Math.random() * (max - min) + min)
  }

  // Basically, whoever calls this function will request the deployer
  // to deploy a mock based on the type, while also minting to the
  // signer's address and returning the interface of Asset based on type.
  // This creates the assets to be sent or received and mint those assets
  // to the account that will send them.
  // @param signer - The signer that will send the assets
  // @param contractName - The name of the contract to be deployed
  // @param type - The type of the contract to be deployed
  // @param amountOrId - The amount or id of the asset to be minted based on type
  async function getMockAssetsToSendOrReceive(
    signer: SignerWithAddress,
    contractName: string,
    type: string,
    amountOrId: number,
  ): Promise<ERC20Asset | ERC721Asset | ERC721Options> {
    // check which type we'll be handling
    if (
      type.toUpperCase() !== 'ERC20' &&
      type.toUpperCase() !== 'ERC721' &&
      type.toUpperCase() !== 'ERC721OPTIONS'
    ) {
      throw new Error('Invalid type')
    }

    let abi = type.toUpperCase() === 'ERC20' ? abiERC20 : abiERC721
    let factoryName =
      type.toUpperCase() === 'ERC20' ? 'MockERC20' : 'MockERC721'

    // Try to find the contract in the mockList
    let findContract = mockList.find(
      (mock) => mock.contractName === contractName,
    )

    // if the contract is not found, deploy it and mint to the user
    let mockContract: any
    if (!findContract) {
      // get a random number to use as the contract symbol
      let contractSymbol = (await getRandomArbitrary(100, 9999999)).toString()
      // deploy the contract and mint to the receiver
      mockContract = await deploy(
        factoryName,
        deployer,
        contractName,
        contractSymbol,
      )
    } else {
      // if the contract already exists, we fetch the instance
      mockContract = new ethers.Contract(
        findContract.contractAddress,
        abi,
        deployer,
      )
    }

    // then we connect to the contract with the signer requesting the assets
    const mockConnection = mockContract.connect(signer)

    // if the type is ERC20, we multiply the decimals
    let amount =
      type.toUpperCase() === 'ERC20'
        ? ethers.utils.parseUnits(amountOrId.toString(), 18)
        : amountOrId

    let tx: any
    if (type.toUpperCase() === 'ERC721OPTIONS') {
      // in the case of erc721Options, the amountOrId will be the amount of tokens ids to be minted
      // for (let i = 0; i < amountOrId; i++) {
      //   let tokenId = await getRandomArbitrary(100, 10000)
      //   tx = await mockConnection.mintTo(signer.address, tokenId)
      //   await expect(tx)
      //     .to.emit(mockConnection, 'Transfer')
      //     .withArgs(ethers.constants.AddressZero, signer.address, tokenId)
      // }
    } else {
      // mint to the signer's address for erc20 or erc721
      tx = await mockConnection.mintTo(signer.address, amount)
      await expect(tx)
        .to.emit(mockConnection, 'Transfer')
        .withArgs(ethers.constants.AddressZero, signer.address, amount)
    }

    // add the contract to the mockList
    mockList.push({
      contractAddress: mockConnection.address,
      contractName: contractName,
    })

    // return the assets to be sent or received
    if (type.toUpperCase() === 'ERC20') {
      let asset_erc20: ERC20Asset = {
        addr: mockConnection.address,
        amountOrId: amount,
      }
      return asset_erc20
    } else if (type.toUpperCase() === 'ERC721') {
      let asset_erc721: ERC721Asset = {
        addr: mockConnection.address,
        amountOrId: Number(amount),
      }
      return asset_erc721
    } else if (type.toUpperCase() === 'ERC721OPTIONS') {
      let asset_erc721Options: ERC721Options = {
        addr: mockConnection.address,
        amountOrId: Number(amount),
      }
      return asset_erc721Options
    }

    throw new Error('Impossible error happened')
  }

  // This will grant allowance for the Assets to be sent to the swaplace contract
  // @params assets: Assets
  // @params user: SignerWithAddress
  async function allowanceOfAssets(assets: Assets, signer: SignerWithAddress) {
    for (let i = 0; i < assets.erc20.length; i++) {
      const contract = new ethers.Contract(
        assets.erc20[i].addr,
        abiERC20,
        signer,
      )
      let tx = await contract.approve(
        swaplace.address,
        assets.erc20[i].amountOrId,
      )
      expect(tx).not.to.be.reverted
      tx = await contract.allowance(signer.address, swaplace.address)
      expect(tx.toString()).to.be.equal(assets.erc20[i].amountOrId.toString())
    }

    for (let i = 0; i < assets.erc721.length; i++) {
      const contract = new ethers.Contract(
        assets.erc721[i].addr,
        abiERC721,
        signer,
      )
      let tx = await contract.approve(
        swaplace.address,
        assets.erc721[i].amountOrId,
      )
      expect(tx).to.not.be.reverted
    }
  }

  // This function will create a mock asset based on the type
  // @param user: SignerWithAddress
  // @param contractNames: string[]
  // @param type: ERCTypes
  async function createMockAsset(
    assets: Assets,
    user: SignerWithAddress,
    contractNames: string[],
    type: ERCTypes,
  ): Promise<Assets> {
    const assetList = []
    for (const contract of contractNames) {
      let amount =
        type == 'erc721Options'
          ? await getRandomArbitrary(1, 5)
          : await getRandomArbitrary(1, 10000)
      assetList.push(
        await getMockAssetsToSendOrReceive(user, contract, type, amount),
      )
    }
    assets[type] = assetList

    return assets
  }

  it('Should propose and accept a trade sending tokenA, asking for tokenB, tokenC, tokenD', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(assetsToBid, userA, ['TokenA'], 'erc20')
    assetsToAsk = await createMockAsset(
      assetsToAsk,
      userB,
      ['TokenB', 'TokenC', 'TokenD'],
      'erc20',
    )

    // Allowance for the amount to be transfered
    await allowanceOfAssets(assetsToBid, userA)
    await allowanceOfAssets(assetsToAsk, userB)
    // Propose Trade
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // Accept Trade
    tx = await connectUserB.acceptTrade(
      tradeCount, // trade id for which the trade will be accepted
      assetsToAsk,
      userB.address, // the withdraw address for the trade
      0, // the index of allowance in case the trade has an allowedAddress list
      [], // the token idsOptions asked by the trace creator
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeAccepted')
      .withArgs(tradeCount, userB.address, userB.address)
    tradeCount++
  })

  it('Should propose and accept a trade sending nftA, asking for nftB', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(assetsToBid, userA, ['nftA'], 'erc721')
    assetsToAsk = await createMockAsset(assetsToAsk, userB, ['nftB'], 'erc721')

    // Allowance for the amount to be transfered
    await allowanceOfAssets(assetsToBid, userA)
    await allowanceOfAssets(assetsToAsk, userB)

    // Propose Trade
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // Accept Trade
    tx = await connectUserB.acceptTrade(
      tradeCount, // trade id for which the trade will be accepted
      assetsToAsk,
      userB.address, // the withdraw address for the trade
      0, // the index of allowance in case the trade has an allowedAddress list
      [], // the token idsOptions asked by the trace creator
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeAccepted')
      .withArgs(tradeCount, userB.address, userB.address)
    tradeCount++
  })

  it('Should propose and accept a trade sending both erc20 and erc721', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(
      assetsToBid,
      userA,
      ['tokenA', 'tokenB'],
      'erc20',
    )
    assetsToBid = await createMockAsset(
      assetsToBid,
      userA,
      ['nftA', 'nftD'],
      'erc721',
    )
    assetsToAsk = await createMockAsset(
      assetsToAsk,
      userB,
      ['tokenA', 'tokenB'],
      'erc20',
    )
    assetsToAsk = await createMockAsset(
      assetsToAsk,
      userB,
      ['nftB', 'nftC'],
      'erc721',
    )

    // Allowance for the amount to be transfered
    await allowanceOfAssets(assetsToBid, userA)
    await allowanceOfAssets(assetsToAsk, userB)

    // Propose Trade
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // Accept Trade
    tx = await connectUserB.acceptTrade(
      tradeCount, // trade id for which the trade will be accepted
      assetsToAsk,
      userB.address, // the withdraw address for the trade
      0, // the index of allowance in case the trade has an allowedAddress list
      [], // the token idsOptions asked by the trace creator
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeAccepted')
      .withArgs(tradeCount, userB.address, userB.address)
    tradeCount++
  })

  it('Should propose and accept a trade sending tokenA, asking for tokenB, but fail by not providing allowance or assets', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(assetsToBid, userA, ['tokenA'], 'erc20')
    assetsToAsk = await createMockAsset(assetsToAsk, userB, ['tokenB'], 'erc20')

    // We'll not provide allowance for the trades
    // await allowanceOfAssets(assetsToBid, userA)
    // await allowanceOfAssets(assetsToAsk, userB)

    // Propose Trade - must fail in here due to lack of allowance
    await expect(
      connectUserA.proposeTrade(
        0, // tradeRefId -> 0 because there is no other trades
        DAYS, // expirationDate
        userA.address, // withdrawAddress
        [], // allowedAddress list, only those listed can accept the trade
        assetsToBid,
        assetsToAsk,
      ),
    ).to.be.revertedWith('ERC20: insufficient allowance')

    // We'll allow the allowance for the trade creation,
    // but not for the trade acceptancee
    await allowanceOfAssets(assetsToBid, userA)

    // Propose Trade - will work now, cause of above line
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // Accept Trade - will fail, cause of lack of allowance
    await expect(
      connectUserB.acceptTrade(
        tradeCount, // trade id for which the trade will be accepted
        assetsToAsk,
        userB.address, // the withdraw address for the trade
        0, // the index of allowance in case the trade has an allowedAddress list
        [], // the token idsOptions asked by the trace creator
      ),
    ).to.be.revertedWith('ERC20: insufficient allowance')

    // We'll still increase trade count, because the trade was created
    tradeCount++
  })

  it('Should propose and accept a trade sending nftA, asking for nftB, but fail by not providing allowance or assets', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(assetsToBid, userA, ['nftC'], 'erc721')
    assetsToAsk = await createMockAsset(assetsToAsk, userB, ['nftB'], 'erc721')

    // We'll not provide allowance for the trades
    // await allowanceOfAssets(assetsToBid, userA)
    // await allowanceOfAssets(assetsToAsk, userB)

    // Propose Trade - must fail in here due to lack of allowance
    await expect(
      connectUserA.proposeTrade(
        0, // tradeRefId -> 0 because there is no other trades
        DAYS, // expirationDate
        userA.address, // withdrawAddress
        [], // allowedAddress list, only those listed can accept the trade
        assetsToBid,
        assetsToAsk,
      ),
    ).to.be.revertedWith('ERC721: caller is not token owner or approved')

    // We'll allow the allowance for the trade creation,
    // but not for the trade acceptancee
    await allowanceOfAssets(assetsToBid, userA)

    // Propose Trade - will work now, cause of above line
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // Accept Trade - will fail, cause of lack of allowance
    await expect(
      connectUserB.acceptTrade(
        tradeCount, // trade id for which the trade will be accepted
        assetsToAsk,
        userB.address, // the withdraw address for the trade
        0, // the index of allowance in case the trade has an allowedAddress list
        [], // the token idsOptions asked by the trace creator
      ),
    ).to.be.revertedWith('ERC721: caller is not token owner or approved')

    // We'll still increase trade count, because the trade was created
    tradeCount++
  })

  it('Should propose and accept a trade sending both erc20 and erc721, but fail due to adultarition in the hashproof', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(assetsToBid, userA, ['tokenA'], 'erc20')
    assetsToBid = await createMockAsset(assetsToBid, userA, ['nftA'], 'erc721')
    assetsToAsk = await createMockAsset(assetsToAsk, userB, ['tokenB'], 'erc20')
    assetsToAsk = await createMockAsset(assetsToAsk, userB, ['nftB'], 'erc721')

    // Allowance for the amount to be transfered
    await allowanceOfAssets(assetsToBid, userA)
    await allowanceOfAssets(assetsToAsk, userB)

    // Propose Trade
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // We'll mess up the assetsToAsk by saying that we'll be sending no assets at all
    assetsToAsk['erc20'][0].amountOrId = ethers.utils.parseUnits('0', 18)

    // Accept Trade
    await expect(
      connectUserB.acceptTrade(
        tradeCount, // trade id for which the trade will be accepted
        assetsToAsk,
        userB.address, // the withdraw address for the trade
        0, // the index of allowance in case the trade has an allowedAddress list
        [], // the token idsOptions asked by the trace creator
      ),
    ).to.be.revertedWith('Hashproof does not match')
    tradeCount++
  })

  it('Should propose and accept a trade sending both erc20 and erc721, but fail due to trade timestamp expiration', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(assetsToBid, userA, ['tokenA'], 'erc20')
    assetsToBid = await createMockAsset(assetsToBid, userA, ['nftA'], 'erc721')
    assetsToAsk = await createMockAsset(assetsToAsk, userB, ['tokenB'], 'erc20')
    assetsToAsk = await createMockAsset(assetsToAsk, userB, ['nftB'], 'erc721')

    // Allowance for the amount to be transfered
    await allowanceOfAssets(assetsToBid, userA)
    await allowanceOfAssets(assetsToAsk, userB)

    // Propose Trade
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // Advance time to the expiration date
    await evm.advanceTime(DAYS)

    // Accept Trade
    await expect(
      connectUserB.acceptTrade(
        tradeCount, // trade id for which the trade will be accepted
        assetsToAsk,
        userB.address, // the withdraw address for the trade
        0, // the index of allowance in case the trade has an allowedAddress list
        [], // the token idsOptions asked by the trace creator
      ),
    ).to.be.revertedWith('Trade is not valid anymore')
    tradeCount++
  })

  it('Should propose and accept a trade sending nftA, asking for nftB, must be in the allowlist', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(assetsToBid, userA, ['nftA'], 'erc721')
    assetsToAsk = await createMockAsset(assetsToAsk, userB, ['nftB'], 'erc721')

    // Allowance for the amount to be transfered
    await allowanceOfAssets(assetsToBid, userA)
    await allowanceOfAssets(assetsToAsk, userB)

    // Propose Trade -- notice the userB is in the allow list
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [userB.address], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // We must first discover if we are in the allow list, to save, we'll do off-chain check
    let allowedIndex = await connectUserB.getAllowedAddressIndex(
      tradeCount,
      userB.address,
    )

    // Accept Trade
    tx = await connectUserB.acceptTrade(
      tradeCount, // trade id for which the trade will be accepted
      assetsToAsk,
      userB.address, // the withdraw address for the trade
      allowedIndex, // the index of allowance in case the trade has an allowedAddress list
      [], // the token idsOptions asked by the trace creator
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeAccepted')
      .withArgs(tradeCount, userB.address, userB.address)
    tradeCount++
  })

  it('Should propose and accept a trade sending nftA, asking for nftB, but fail by not being in the allowlist', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(assetsToBid, userA, ['nftA'], 'erc721')
    assetsToAsk = await createMockAsset(assetsToAsk, userB, ['nftB'], 'erc721')

    // Allowance for the amount to be transfered
    await allowanceOfAssets(assetsToBid, userA)
    await allowanceOfAssets(assetsToAsk, userB)

    // Propose Trade -- notice the userB is in the allow list
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [receiverA.address, receiverB.address], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // We must first discover if we are in the allow list, to save, we'll do off-chain check
    // Now we are expecting not to be on the allow list
    await expect(connectUserB.getAllowedAddressIndex(tradeCount, userB.address))
      .to.be.reverted

    // Accept Trade -- passing random index -trying 0 because there is one ref there
    await expect(
      connectUserB.acceptTrade(
        tradeCount, // trade id for which the trade will be accepted
        assetsToAsk,
        userB.address, // the withdraw address for the trade
        0, // the index of allowance in case the trade has an allowedAddress list
        [], // the token idsOptions asked by the trace creator
      ),
    ).to.be.revertedWith('Trade not allowed for this address')
    tradeCount++
  })

  it('Should propose and accept a trade in exchange for random nft using options ', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(assetsToBid, userA, ['nftA'], 'erc721')
    assetsToAsk = await createMockAsset(
      assetsToAsk,
      userB,
      ['nftBo', 'nftCo', 'nftDo'],
      'erc721Options',
    )

    // Allowance for the amount to be transfered - don't handle erc721options
    await allowanceOfAssets(assetsToBid, userA)
    await allowanceOfAssets(assetsToAsk, userB)

    // Propose Trade
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // Get the tokens for idOptions
    let idOptions = []
    // The contracts where deployed in creaMockAsset, so we just need to get the instance
    for (let i = 0; i < assetsToAsk.erc721Options.length; i++) {
      const connectERC721 = new ethers.Contract(
        assetsToAsk.erc721Options[i].addr,
        abiERC721,
        userB,
      )
      for (let j = 0; j < assetsToAsk.erc721Options[i].amountOrId; j++) {
        // We mint a random tokenId for each in amountOrId
        let tokenId = await getRandomArbitrary(100, 10000)
        await connectERC721.mintTo(userB.address, tokenId)
        // We ask allowance for the transfer
        await connectERC721.approve(swaplace.address, tokenId)
        // We add the token id to the array
        idOptions.push(tokenId)
      }
    }
    // Accept Trade
    tx = await connectUserB.acceptTrade(
      tradeCount, // trade id for which the trade will be accepted
      assetsToAsk,
      userB.address, // the withdraw address for the trade
      0, // the index of allowance map in case the trade has an allowedAddress list
      idOptions, // the token idsOptions asked by the trade creator
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeAccepted')
      .withArgs(tradeCount, userB.address, userB.address)
    tradeCount++
  })

  it('Should propose and accept a trade in exchnage for random nft using options, but fail by not providing allowance or lack of assets', async function () {
    // Create assets to send or receive, bid or ask
    let assetsToBid: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    let assetsToAsk: Assets = {
      erc20: [],
      erc721: [],
      erc721Options: [],
    }
    // We add will deploy the contract names, mint to the user and add the trade assets to the bid/ask
    assetsToBid = await createMockAsset(assetsToBid, userA, ['nftA'], 'erc721')
    assetsToAsk = await createMockAsset(
      assetsToAsk,
      userB,
      ['nftBo', 'nftCo', 'nftDo'],
      'erc721Options',
    )

    // Allowance for the amount to be transfered - don't handle erc721options
    await allowanceOfAssets(assetsToBid, userA)
    await allowanceOfAssets(assetsToAsk, userB)

    // Propose Trade
    let tx = await connectUserA.proposeTrade(
      0, // tradeRefId -> 0 because there is no other trades
      DAYS, // expirationDate
      userA.address, // withdrawAddress
      [], // allowedAddress list, only those listed can accept the trade
      assetsToBid,
      assetsToAsk,
    )
    await expect(tx)
      .to.emit(swaplace, 'TradeProposed')
      .withArgs(tradeCount, 0, DAYS, userA.address, userA.address, [])

    // Get the tokens for idOptions
    let idOptions = []
    // The contracts where deployed in creaMockAsset, so we just need to get the instance
    for (let i = 0; i < assetsToAsk.erc721Options.length; i++) {
      const connectERC721 = new ethers.Contract(
        assetsToAsk.erc721Options[i].addr,
        abiERC721,
        userB,
      )
      for (let j = 0; j < assetsToAsk.erc721Options[i].amountOrId; j++) {
        // We mint a random tokenId for each in amountOrId
        let tokenId = await getRandomArbitrary(100, 10000)
        await connectERC721.mintTo(userB.address, tokenId)
        // We ask allowance for the transfer -- we take off the allowance
        // await connectERC721.approve(swaplace.address, tokenId)
        // We add the token id to the array
        idOptions.push(tokenId)
      }
    }
    // Accept Trade
    await expect(
      connectUserB.acceptTrade(
        tradeCount, // trade id for which the trade will be accepted
        assetsToAsk,
        userB.address, // the withdraw address for the trade
        0, // the index of allowance map in case the trade has an allowedAddress list
        idOptions, // the token idsOptions asked by the trade creator
      ),
    ).to.be.revertedWith('ERC721: caller is not token owner or approved')
    tradeCount++
  })
})