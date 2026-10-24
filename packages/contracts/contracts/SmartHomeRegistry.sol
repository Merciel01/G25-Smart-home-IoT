// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
contract SmartHomeRegistry is EIP712 {
    struct Device {address owner; address deviceSigner; bytes32 modelId; bool revoked; uint64 registeredAt;}
    struct Permission {uint8 mask; uint64 expiresAt; uint64 revision;}
    struct Command {bytes32 deviceId; address requester; uint8 action; uint64 deadline; uint64 revision; bool finalized;}
    struct Ack {bytes32 requestId; bytes32 deviceId; uint8 action; uint8 outcome; bytes32 stateHash; uint64 executedAt; uint64 deviceNonce;}
    bytes32 public constant ACK_TYPEHASH=keccak256('Ack(bytes32 requestId,bytes32 deviceId,uint8 action,uint8 outcome,bytes32 stateHash,uint64 executedAt,uint64 deviceNonce)');
    bytes32 public constant LOCK_MODEL=keccak256('G25-LOCK'); bytes32 public constant PLUG_MODEL=keccak256('G25-PLUG'); bytes32 public constant CAM_MODEL=keccak256('G25-CAM');
    uint64 public constant MAX_TTL=600;
    address public immutable gatewaySigner;
    mapping(bytes32=>Device) private devices;
    mapping(address=>bool) public signerUsed;
    mapping(bytes32=>mapping(address=>Permission)) public permissions;
    mapping(bytes32=>Command) public commands;
    mapping(address=>uint256) public nonces;
    error InvalidInput(); error PermissionDenied(); error DeviceRevoked(); error InvalidAck();
    event DeviceRegistered(bytes32 indexed deviceId,address indexed owner,address deviceSigner,bytes32 modelId);
    event PermissionGranted(bytes32 indexed deviceId,address indexed user,uint8 mask,uint64 expiresAt,uint64 revision);
    event PermissionRevoked(bytes32 indexed deviceId,address indexed user,uint64 revision);
    event DeviceRevokedEvent(bytes32 indexed deviceId);
    event CommandRequested(bytes32 indexed requestId,bytes32 indexed deviceId,address indexed requester,uint8 action,uint64 deadline,uint64 revision);
    event CommandResultRecorded(bytes32 indexed requestId,bytes32 indexed deviceId,uint8 outcome,bytes32 stateHash,uint64 executedAt,uint64 deviceNonce);
    constructor(address gateway) EIP712('G25Home','1') {if(gateway==address(0)) revert InvalidInput(); gatewaySigner=gateway;}
    function getDevice(bytes32 id) external view returns(Device memory){return devices[id];}
    function allowedMask(bytes32 model) public pure returns(uint8){if(model==LOCK_MODEL)return 3; if(model==PLUG_MODEL)return 12; if(model==CAM_MODEL)return 48; return 0;}
    function registerDevice(bytes32 id,address signer,bytes32 model) external {
        if(id==0 || devices[id].owner!=address(0) || signer==address(0) || signer==msg.sender || signer==gatewaySigner || signerUsed[signer] || allowedMask(model)==0) revert InvalidInput();
        signerUsed[signer]=true; devices[id]=Device(msg.sender,signer,model,false,uint64(block.timestamp)); emit DeviceRegistered(id,msg.sender,signer,model);
    }
    function ownerCheck(bytes32 id) private view {if(devices[id].owner!=msg.sender)revert PermissionDenied();}
    function activeCheck(bytes32 id) private view {if(devices[id].owner==address(0))revert InvalidInput(); if(devices[id].revoked)revert DeviceRevoked();}
    function grantPermission(bytes32 id,address user,uint8 mask,uint64 expiresAt) external {
        ownerCheck(id);activeCheck(id);if(user==address(0)|| mask==0 || (mask & allowedMask(devices[id].modelId))!=mask || expiresAt<=block.timestamp)revert InvalidInput();
        Permission storage p=permissions[id][user];p.mask=mask;p.expiresAt=expiresAt;p.revision++;emit PermissionGranted(id,user,mask,expiresAt,p.revision);
    }
    function revokePermission(bytes32 id,address user) external {ownerCheck(id); Permission storage p=permissions[id][user];p.mask=0;p.expiresAt=0;p.revision++;emit PermissionRevoked(id,user,p.revision);}
    function revokeDevice(bytes32 id) external {ownerCheck(id);activeCheck(id);devices[id].revoked=true;emit DeviceRevokedEvent(id);}
    function hasPermission(bytes32 id,address user,uint8 action) public view returns(bool){
        Device memory d=devices[id];if(d.owner==address(0)||d.revoked|| action>5 || (allowedMask(d.modelId)&uint8(1<<action))==0)return false;
        Permission memory p=permissions[id][user];return user==d.owner || (p.expiresAt>block.timestamp && (p.mask & uint8(1<<action))!=0);
    }
    function requestCommand(bytes32 id,uint8 action,uint64 deadline) external returns(bytes32 requestId){
        activeCheck(id);if(!hasPermission(id,msg.sender,action))revert PermissionDenied();if(deadline<=block.timestamp || deadline>block.timestamp+MAX_TTL)revert InvalidInput();
        requestId=keccak256(abi.encode(block.chainid,address(this),msg.sender,nonces[msg.sender]++));
        uint64 revision=msg.sender==devices[id].owner ? 0 : permissions[id][msg.sender].revision;
        commands[requestId]=Command(id,msg.sender,action,deadline,revision,false);emit CommandRequested(requestId,id,msg.sender,action,deadline,revision);
    }
    function isCommandExecutable(bytes32 requestId) external view returns(bool){Command memory c=commands[requestId]; return c.requester!=address(0) && !c.finalized && block.timestamp<c.deadline && hasPermission(c.deviceId,c.requester,c.action) && (c.requester==devices[c.deviceId].owner || permissions[c.deviceId][c.requester].revision==c.revision);}
    function recordCommandResult(Ack calldata a,bytes calldata sig) external {
        Command storage c=commands[a.requestId];
        if(c.requester==address(0)||c.finalized||a.deviceId!=c.deviceId||a.action!=c.action||a.outcome>1||a.executedAt>block.timestamp||a.executedAt>c.deadline||a.executedAt<devices[a.deviceId].registeredAt)revert InvalidAck();
        bytes32 h=keccak256(abi.encode(ACK_TYPEHASH,a.requestId,a.deviceId,a.action,a.outcome,a.stateHash,a.executedAt,a.deviceNonce));
        if(ECDSA.recover(_hashTypedDataV4(h),sig)!=devices[a.deviceId].deviceSigner)revert InvalidAck();
        c.finalized=true;emit CommandResultRecorded(a.requestId,a.deviceId,a.outcome,a.stateHash,a.executedAt,a.deviceNonce);
    }
}
