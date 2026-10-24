// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {EIP712} from '@openzeppelin/contracts/utils/cryptography/EIP712.sol';
import {ECDSA} from '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
contract FirmwareRegistry is Ownable, EIP712 {
    struct Manifest { bytes32 modelId; uint64 version; bytes32 sha256Digest; bytes32 cidHash; uint64 fileSize; address manufacturer; }
    struct Release { Manifest manifest; string cid; bytes signature; }
    bytes32 public constant TYPEHASH = keccak256('FirmwareManifest(bytes32 modelId,uint64 version,bytes32 sha256Digest,bytes32 cidHash,uint64 fileSize,address manufacturer)');
    mapping(bytes32 => mapping(address => bool)) public isManufacturerAuthorized;
    mapping(bytes32 => uint64) public latestVersion;
    mapping(bytes32 => mapping(uint64 => Release)) private releases;
    error InvalidFirmware(); error UnauthorizedManufacturer();
    event ManufacturerAuthorization(bytes32 indexed modelId,address indexed manufacturer,bool authorized);
    event FirmwarePublished(bytes32 indexed modelId,uint64 indexed version,address indexed manufacturer,bytes32 digest,string cid);
    constructor(address admin) Ownable(admin) EIP712('G25Firmware','1') {}
    function authorizeManufacturer(bytes32 modelId,address manufacturer) external onlyOwner { if(modelId==0 || manufacturer==address(0)) revert InvalidFirmware(); isManufacturerAuthorized[modelId][manufacturer]=true; emit ManufacturerAuthorization(modelId,manufacturer,true); }
    function revokeManufacturer(bytes32 modelId,address manufacturer) external onlyOwner { isManufacturerAuthorized[modelId][manufacturer]=false; emit ManufacturerAuthorization(modelId,manufacturer,false); }
    function publishFirmware(Manifest calldata m,string calldata cid,bytes calldata signature) external {
        if(!isManufacturerAuthorized[m.modelId][m.manufacturer]) revert UnauthorizedManufacturer();
        bytes memory c=bytes(cid);
        if(m.version<=latestVersion[m.modelId] || m.fileSize==0 || m.fileSize>1048576 || m.sha256Digest==0 || c.length<10 || c.length>100 || keccak256(c)!=m.cidHash) revert InvalidFirmware();
        // Canonical IPFS CIDv1 base32, lower-case; no URLs, paths, queries or whitespace.
        if(c[0]!=0x62) revert InvalidFirmware();
        for(uint i=1;i<c.length;i++) if(!((c[i]>=0x61 && c[i]<=0x7a)||(c[i]>=0x32 && c[i]<=0x37))) revert InvalidFirmware();
        bytes32 h=keccak256(abi.encode(TYPEHASH,m.modelId,m.version,m.sha256Digest,m.cidHash,m.fileSize,m.manufacturer));
        if(ECDSA.recover(_hashTypedDataV4(h),signature)!=m.manufacturer) revert UnauthorizedManufacturer();
        releases[m.modelId][m.version]=Release(m,cid,signature); latestVersion[m.modelId]=m.version;
        emit FirmwarePublished(m.modelId,m.version,m.manufacturer,m.sha256Digest,cid);
    }
    function getFirmware(bytes32 modelId,uint64 version) external view returns(Release memory) {return releases[modelId][version];}
}
